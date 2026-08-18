import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_FILTERS } from "../attributes";
import { supabaseConsumer, supabaseProvider, supabaseAdmin, fetchProfile } from "../supabaseClient";

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
  const [location, setLocation] = useState({ zip: "77494", city: "Katy", state: "TX" });
  const [needType, setNeedType] = useState("planning_ahead");
  const [compareTray, setCompareTray] = useState([]); // array of offeringIds
  const [filters, setFiltersState] = useState(DEFAULT_FILTERS);
  const setFilters = (patch) => setFiltersState((prev) => ({ ...prev, ...patch }));
  const clearFilters = () => setFiltersState(DEFAULT_FILTERS);

  const [consumerSession, setConsumerSession] = useState(null);
  const [consumerUser, setConsumerUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Clicking the link in a password-reset email signs the user in — that's how
  // Supabase authorizes the password change. Without tracking it separately,
  // that session would satisfy the navigator's `consumerToken ? Main` check and
  // drop the user straight into the app, never showing them the form to choose
  // a new password. While this is true the gate stays up in "reset" mode.
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const [providerSession, setProviderSession] = useState(null);
  const [providerUser, setProviderUser] = useState(null);

  const [adminSession, setAdminSession] = useState(null);
  const [adminUser, setAdminUser] = useState(null);

  const [toast, setToast] = useState(null); // { message, tone }
  const showToast = (message, tone = "ok") => {
    setToast({ message, tone, key: Date.now() });
  };

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: p }, { data: a }] = await Promise.all([
        supabaseConsumer.auth.getSession(),
        supabaseProvider.auth.getSession(),
        supabaseAdmin.auth.getSession(),
      ]);
      if (c.session) {
        setConsumerSession(c.session);
        setConsumerUser(await fetchProfile(supabaseConsumer, c.session.user.id));
      }
      if (p.session) {
        setProviderSession(p.session);
        setProviderUser(await fetchProfile(supabaseProvider, p.session.user.id));
      }
      if (a.session) {
        setAdminSession(a.session);
        setAdminUser(await fetchProfile(supabaseAdmin, a.session.user.id));
      }
      setAuthLoading(false);
    })();

    const { data: subC } = supabaseConsumer.auth.onAuthStateChange((event, session) => {
      // Fires when the app is opened from a reset email. detectSessionInUrl is
      // already enabled for this client on web, so the recovery token in the
      // URL has been exchanged for a session by the time this runs.
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setConsumerSession(session);
      if (!session) {
        setConsumerUser(null);
        setPasswordRecovery(false);
      }
    });
    const { data: subP } = supabaseProvider.auth.onAuthStateChange((_event, session) => {
      setProviderSession(session);
      if (!session) setProviderUser(null);
    });
    const { data: subA } = supabaseAdmin.auth.onAuthStateChange((_event, session) => {
      setAdminSession(session);
      if (!session) setAdminUser(null);
    });
    return () => {
      subC.subscription.unsubscribe();
      subP.subscription.unsubscribe();
      subA.subscription.unsubscribe();
    };
  }, []);

  const consumerToken = consumerSession?.access_token || null;
  const providerToken = providerSession?.access_token || null;
  const adminToken = adminSession?.access_token || null;

  const consumerLogin = async (email, password) => {
    const { data, error } = await supabaseConsumer.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const profile = await fetchProfile(supabaseConsumer, data.user.id);
    setConsumerUser(profile);
    return profile;
  };

  const consumerSignup = async (name, email, password) => {
    const { data, error } = await supabaseConsumer.auth.signUp({ email, password, options: { data: { name } } });
    if (error) throw new Error(error.message);
    // The profile row is created by a database trigger, which can lag the
    // signUp response by a moment — retry once before giving up.
    let profile = await fetchProfile(supabaseConsumer, data.user.id);
    if (!profile) {
      await new Promise((r) => setTimeout(r, 500));
      profile = await fetchProfile(supabaseConsumer, data.user.id);
    }
    setConsumerUser(profile);
    return profile;
  };

  const consumerGoogleAuth = async () => {
    const { error } = await supabaseConsumer.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    if (error) throw new Error(error.message);
    // On web this navigates away to Google's consent screen; the session is
    // picked up by onAuthStateChange after the redirect back.
  };

  /**
   * Step 1 of a password reset: email the user a recovery link.
   *
   * Deliberately resolves the same way whether or not an account exists for the
   * address. Supabase does not distinguish either, and surfacing the difference
   * would turn this form into an account-enumeration oracle — anyone could
   * discover which of their contacts had used the service, which for a funeral
   * price comparison site is unusually sensitive. The caller shows a neutral
   * "if an account exists, check your email" message.
   */
  const consumerRequestPasswordReset = async (email) => {
    const { error } = await supabaseConsumer.auth.resetPasswordForEmail(email, {
      // Where the emailed link lands. Must be listed under Authentication >
      // URL Configuration > Redirect URLs in the Supabase dashboard, or the
      // link falls back to the project's Site URL and the reset silently
      // fails to reach this app.
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    });
    if (error) throw new Error(error.message);
  };

  /**
   * Step 2: set the new password, using the session the recovery link created.
   */
  const consumerCompletePasswordReset = async (newPassword) => {
    const { data, error } = await supabaseConsumer.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
    setPasswordRecovery(false);
    const profile = await fetchProfile(supabaseConsumer, data.user.id);
    setConsumerUser(profile);
    return profile;
  };

  /**
   * Abandon a reset. The recovery link already signed them in, so leaving the
   * form without signing out would silently grant access on an unchanged
   * password — sign out so they land back on the gate.
   */
  const consumerCancelPasswordReset = async () => {
    setPasswordRecovery(false);
    await supabaseConsumer.auth.signOut();
    setConsumerUser(null);
  };

  const consumerLogout = async () => {
    setPasswordRecovery(false);
    await supabaseConsumer.auth.signOut();
    setConsumerUser(null);
  };

  const providerLogin = async (email, password) => {
    const { data, error } = await supabaseProvider.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    const { data: aal } = await supabaseProvider.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: factors } = await supabaseProvider.auth.mfa.listFactors();
      const factor = factors?.totp?.[0];
      return { mfaRequired: true, factorId: factor?.id || null };
    }

    const profile = await fetchProfile(supabaseProvider, data.user.id);
    const needsEnrollment = profile && ["owner", "administrator"].includes(profile.providerRole);
    if (needsEnrollment) {
      const { data: factors } = await supabaseProvider.auth.mfa.listFactors();
      if (!factors?.totp?.length) return { mfaEnrollmentRequired: true };
    }

    setProviderUser(profile);
    return profile;
  };

  const providerVerifyMfa = async (factorId, code) => {
    const { data: challenge, error: challengeError } = await supabaseProvider.auth.mfa.challenge({ factorId });
    if (challengeError) throw new Error(challengeError.message);
    const { data, error } = await supabaseProvider.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (error) throw new Error(error.message);
    const profile = await fetchProfile(supabaseProvider, data.user.id);
    setProviderUser(profile);
    return profile;
  };

  const providerCompleteMfaEnrollment = async () => {
    const { data } = await supabaseProvider.auth.getUser();
    const profile = data?.user ? await fetchProfile(supabaseProvider, data.user.id) : null;
    setProviderUser(profile);
    return profile;
  };

  const providerLogout = async () => {
    await supabaseProvider.auth.signOut();
    setProviderUser(null);
  };

  const adminLogin = async (email, password) => {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const profile = await fetchProfile(supabaseAdmin, data.user.id);
    if (profile?.role !== "platform_admin") {
      await supabaseAdmin.auth.signOut();
      throw new Error("This account is not a platform admin.");
    }
    setAdminUser(profile);
    return profile;
  };

  const adminLogout = async () => {
    await supabaseAdmin.auth.signOut();
    setAdminUser(null);
  };

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
      consumerToken,
      consumerUser,
      authLoading,
      consumerLogin,
      consumerSignup,
      consumerGoogleAuth,
      consumerLogout,
      passwordRecovery,
      consumerRequestPasswordReset,
      consumerCompletePasswordReset,
      consumerCancelPasswordReset,
      providerToken,
      providerUser,
      providerLogin,
      providerVerifyMfa,
      providerCompleteMfaEnrollment,
      providerLogout,
      adminToken,
      adminUser,
      adminLogin,
      adminLogout,
      toast,
      showToast,
    }),
    [location, needType, compareTray, filters, consumerToken, consumerUser, authLoading, passwordRecovery, providerToken, providerUser, adminToken, adminUser, toast]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
