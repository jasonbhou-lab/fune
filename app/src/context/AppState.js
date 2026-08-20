import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Linking, Platform } from "react-native";
import { DEFAULT_FILTERS } from "../attributes";
import { supabaseAuth, fetchProfile } from "../supabaseClient";
import { buildPasswordResetRedirectUrl, parseAuthParamsFromUrl, isPasswordRecoveryUrl, describeAuthError } from "../deepLink";

const AppStateContext = createContext(null);

// Roles a person can choose for themselves on the signup form. platform_admin
// is absent on purpose and the database enforces the same whitelist — see
// handle_new_user() in supabase/schema.sql. Offering it here would let anyone
// grant themselves the admin back office from a public form.
export const SELF_SERVICE_ACCOUNT_TYPES = [
  { id: "consumer", label: "I'm planning or arranging a funeral" },
  { id: "provider", label: "I work for a funeral home or provider" },
];

// Provider roles that must hold a second factor before they get in.
const MFA_REQUIRED_PROVIDER_ROLES = ["owner", "administrator"];

export function AppStateProvider({ children }) {
  const [location, setLocation] = useState({ zip: "77494", city: "Katy", state: "TX" });
  const [needType, setNeedType] = useState("planning_ahead");
  const [compareTray, setCompareTray] = useState([]); // array of offeringIds
  const [filters, setFiltersState] = useState(DEFAULT_FILTERS);
  const setFilters = (patch) => setFiltersState((prev) => ({ ...prev, ...patch }));
  const clearFilters = () => setFiltersState(DEFAULT_FILTERS);

  // One session, one profile. The profile's role decides which part of the app
  // the navigator shows; there is no separate per-role login or session.
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Clicking the link in a password-reset email signs the user in — that's how
  // Supabase authorizes the password change. Without tracking it separately,
  // that session would satisfy the navigator's signed-in check and drop the
  // user straight into the app, never showing them the form to choose a new
  // password. While this is true the gate stays up in "reset" mode.
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  // Set when a recovery link comes back unusable (expired, already consumed).
  const [recoveryError, setRecoveryError] = useState(null);

  const [toast, setToast] = useState(null); // { message, tone }
  const showToast = (message, tone = "ok") => {
    setToast({ message, tone, key: Date.now() });
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabaseAuth.auth.getSession();
      if (data.session) {
        setSession(data.session);
        setUser(await fetchProfile(supabaseAuth, data.session.user.id));
      }
      setAuthLoading(false);
    })();

    const { data: sub } = supabaseAuth.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setSession(nextSession);
      if (!nextSession) {
        setUser(null);
        setPasswordRecovery(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /**
   * Turn a recovery deep link into a usable recovery state. Native only — on
   * web, detectSessionInUrl consumes the URL and emits PASSWORD_RECOVERY.
   *
   * Order matters: the recovery flag is set BEFORE the session is installed,
   * because setSession emits SIGNED_IN rather than PASSWORD_RECOVERY, and
   * without the flag the navigator would route on role and flash the signed-in
   * app before the reset form appeared.
   */
  const handleRecoveryDeepLink = async (url) => {
    if (!url || !isPasswordRecoveryUrl(url)) return;
    const params = parseAuthParamsFromUrl(url);

    const failure = describeAuthError(params);
    if (failure) {
      setRecoveryError(failure);
      setPasswordRecovery(false);
      return;
    }

    setRecoveryError(null);
    setPasswordRecovery(true);

    try {
      if (params.code) {
        const { error } = await supabaseAuth.auth.exchangeCodeForSession(params.code);
        if (error) throw error;
      } else if (params.access_token && params.refresh_token) {
        const { error } = await supabaseAuth.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (error) throw error;
      } else {
        throw new Error("The reset link was missing its credentials.");
      }
    } catch (e) {
      setPasswordRecovery(false);
      setRecoveryError(`That reset link could not be used: ${e.message}`);
    }
  };

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    let cancelled = false;
    Linking.getInitialURL()
      .then((url) => {
        if (!cancelled) return handleRecoveryDeepLink(url);
      })
      .catch(() => {});
    const sub = Linking.addEventListener("url", ({ url }) => handleRecoveryDeepLink(url));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const token = session?.access_token || null;
  const role = user?.role || null;

  // The rest of the app still asks for "the provider token" or "the admin
  // user". Those now derive from the single session, gated on the profile's
  // role, so every portal and admin screen keeps working untouched — and a
  // consumer's token is never handed to a portal call, which the backend would
  // reject anyway (requireAuth checks the role on the token).
  const consumerToken = role === "consumer" ? token : null;
  const providerToken = role === "provider" ? token : null;
  const adminToken = role === "platform_admin" ? token : null;
  const consumerUser = role === "consumer" ? user : null;
  const providerUser = role === "provider" ? user : null;
  const adminUser = role === "platform_admin" ? user : null;

  /**
   * The single sign-in path for every role.
   *
   * Returns either the profile, or an MFA instruction for the caller to render:
   *   { mfaRequired: true, factorId }      — a factor exists, needs a code
   *   { mfaEnrollmentRequired: true }      — role demands a factor, none set up
   *
   * The MFA check is role-agnostic on purpose: it fires for any account whose
   * assurance level needs raising, so enrolling a factor on a platform-admin
   * account starts challenging it without further changes here.
   */
  const login = async (email, password) => {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    const { data: aal } = await supabaseAuth.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: factors } = await supabaseAuth.auth.mfa.listFactors();
      return { mfaRequired: true, factorId: factors?.totp?.[0]?.id || null };
    }

    const profile = await fetchProfile(supabaseAuth, data.user.id);

    if (profile?.role === "provider" && MFA_REQUIRED_PROVIDER_ROLES.includes(profile.providerRole)) {
      const { data: factors } = await supabaseAuth.auth.mfa.listFactors();
      if (!factors?.totp?.length) return { mfaEnrollmentRequired: true };
    }

    setUser(profile);
    return profile;
  };

  /**
   * Sign up, declaring an account type.
   *
   * accountType only ever reaches the database as a request: handle_new_user()
   * whitelists it to consumer/provider and ignores anything else, so a tampered
   * client cannot mint a platform admin here.
   */
  const signup = async (name, email, password, accountType) => {
    const { data, error } = await supabaseAuth.auth.signUp({
      email,
      password,
      options: { data: { name, account_type: accountType } },
    });
    if (error) throw new Error(error.message);

    // The profile row is created by a database trigger, which can lag the
    // signUp response by a moment — retry once before giving up.
    let profile = await fetchProfile(supabaseAuth, data.user.id);
    if (!profile) {
      await new Promise((r) => setTimeout(r, 500));
      profile = await fetchProfile(supabaseAuth, data.user.id);
    }
    setUser(profile);
    return profile;
  };

  const verifyMfa = async (factorId, code) => {
    const { data: challenge, error: challengeError } = await supabaseAuth.auth.mfa.challenge({ factorId });
    if (challengeError) throw new Error(challengeError.message);
    const { data, error } = await supabaseAuth.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (error) throw new Error(error.message);
    const profile = await fetchProfile(supabaseAuth, data.user.id);
    setUser(profile);
    return profile;
  };

  const enrollMfa = async () => {
    const { data, error } = await supabaseAuth.auth.mfa.enroll({ factorType: "totp" });
    if (error) throw new Error(error.message);
    return { factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret };
  };

  const completeMfaEnrollment = async () => {
    const { data } = await supabaseAuth.auth.getUser();
    const profile = data?.user ? await fetchProfile(supabaseAuth, data.user.id) : null;
    setUser(profile);
    return profile;
  };

  const googleAuth = async () => {
    const { error } = await supabaseAuth.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    if (error) throw new Error(error.message);
  };

  /**
   * Step 1 of a password reset: email the user a recovery link.
   *
   * Resolves the same way whether or not an account exists. Supabase does not
   * distinguish either, and surfacing the difference would turn this form into
   * an account-enumeration oracle — for a funeral price comparison site,
   * confirming someone has an account is unusually sensitive.
   */
  const requestPasswordReset = async (email) => {
    const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, {
      redirectTo: buildPasswordResetRedirectUrl(),
    });
    if (error) throw new Error(error.message);
  };

  const completePasswordReset = async (newPassword) => {
    const { data, error } = await supabaseAuth.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
    setPasswordRecovery(false);
    const profile = await fetchProfile(supabaseAuth, data.user.id);
    setUser(profile);
    return profile;
  };

  const clearRecoveryError = () => setRecoveryError(null);

  const logout = async () => {
    setPasswordRecovery(false);
    setRecoveryError(null);
    await supabaseAuth.auth.signOut();
    setUser(null);
  };

  /**
   * Abandon a reset. The recovery link already signed them in, so leaving the
   * form without signing out would grant access on an unchanged password.
   */
  const cancelPasswordReset = logout;

  const addToCompare = (offeringId) => {
    setCompareTray((prev) => {
      if (prev.includes(offeringId)) return prev;
      if (prev.length >= 4) return prev;
      return [...prev, offeringId];
    });
  };
  const removeFromCompare = (offeringId) => {
    setCompareTray((prev) => prev.filter((id) => id !== offeringId));
  };
  const clearCompare = () => setCompareTray([]);

  const value = useMemo(
    () => ({
      location,
      setLocation,
      needType,
      setNeedType,
      compareTray,
      addToCompare,
      removeFromCompare,
      clearCompare,
      filters,
      setFilters,
      clearFilters,

      // Unified auth
      session,
      user,
      role,
      authLoading,
      login,
      signup,
      logout,
      googleAuth,
      verifyMfa,
      enrollMfa,
      completeMfaEnrollment,

      // Password reset
      passwordRecovery,
      recoveryError,
      clearRecoveryError,
      requestPasswordReset,
      completePasswordReset,
      cancelPasswordReset,

      // Role-scoped views of the single session, so existing portal/admin and
      // consumer screens keep working without changes.
      consumerToken,
      consumerUser,
      providerToken,
      providerUser,
      adminToken,
      adminUser,

      // Retained aliases: several screens call these directly.
      consumerLogout: logout,
      providerLogout: logout,
      adminLogout: logout,
      consumerRequestPasswordReset: requestPasswordReset,
      consumerCompletePasswordReset: completePasswordReset,
      consumerCancelPasswordReset: cancelPasswordReset,
      consumerGoogleAuth: googleAuth,

      toast,
      showToast,
    }),
    [location, needType, compareTray, filters, session, user, role, authLoading, passwordRecovery, recoveryError, toast]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
