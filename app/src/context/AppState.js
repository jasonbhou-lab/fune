import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Platform } from "react-native";
import { DEFAULT_FILTERS } from "../attributes";
import { supabaseAuth, fetchProfile } from "../supabaseClient";
import { SELF_SERVICE_ACCOUNT_TYPES } from "../accountTypes";
import { saveSignupIntent, takeSignupIntent, clearSignupIntent } from "../signupIntent";
import {
  buildPasswordResetRedirectUrl,
  buildEmailConfirmationRedirectUrl,
  parseAuthParamsFromUrl,
  isPasswordRecoveryUrl,
  describeAuthError,
} from "../deepLink";

const AppStateContext = createContext(null);

// Re-exported so the many screens already importing it from here keep working;
// the list itself moved to accountTypes.js because signupIntent.js needs it and
// importing this module from there would be a cycle.
export { SELF_SERVICE_ACCOUNT_TYPES };

// Provider roles that must hold a second factor before they get in.
const MFA_REQUIRED_PROVIDER_ROLES = ["owner", "administrator"];

// claim_account_type() raises this when its UPDATE matches no row, meaning the
// account already has a settled type. Matched on the message because PostgREST
// does not surface the SQLSTATE for a raised exception.
const ALREADY_CLAIMED = /already has an account type/i;

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

  /**
   * Read the profile for a user id, tolerating the trigger's lag.
   *
   * The row is created database-side by handle_new_user(), which can land a
   * moment after signUp returns, so a single empty read is not proof that the
   * profile is absent.
   */
  const loadProfile = async (userId) => {
    let profile = await fetchProfile(supabaseAuth, userId);
    if (!profile) {
      await new Promise((r) => setTimeout(r, 500));
      profile = await fetchProfile(supabaseAuth, userId);
    }
    return profile;
  };

  /**
   * Load the profile and, for a brand-new Google account, apply the answers
   * given before the redirect.
   *
   * Google hands back a verified identity and nothing else, so handle_new_user()
   * flags the profile role_pending. If the person answered the signup questions
   * before pressing "Continue with Google", those answers were parked in storage
   * (React state does not survive a full-page redirect) and this is where they
   * get spent — so they are not asked the same questions twice.
   *
   * Only ever applied to a role_pending profile, which by construction means an
   * account that has never chosen. If anything is missing, stale, or the claim is
   * rejected, the flag stays set and ChooseRoleScreen asks properly. That is the
   * fallback for every failure here, which is why none of them throw.
   */
  // Two effects below both resolve the profile on an OAuth return: the mount
  // effect once getSession() settles, and the session-arrival effect the moment
  // onAuthStateChange supplies a session while `user` is still null. They used to
  // race, and both would take the parked intent and fire the claim — one won, one
  // raised "This account already has an account type", and whichever setUser
  // landed last decided what the user saw. When the loser landed last, its stale
  // role_pending profile put a settled account back on the role prompt.
  //
  // Sharing one in-flight promise per user id means the second caller joins the
  // first instead of starting a second claim.
  const resolveInFlight = useRef(new Map());

  const resolveProfile = (userId) => {
    const existing = resolveInFlight.current.get(userId);
    if (existing) return existing;

    const pending = (async () => {
      const profile = await loadProfile(userId);
      if (!profile?.rolePending) {
        // This account has already chosen — including any created before the role
        // prompt existed, which land here as whatever handle_new_user() guessed.
        // Their answers are not applied, by design, but a leftover intent must
        // not sit in storage waiting to be spent on some later, unrelated signup
        // in this browser.
        await clearSignupIntent();
        return profile;
      }

      const intent = await takeSignupIntent();
      if (!intent) return profile;

      try {
        const claimed = await claimAccountTypeFor(intent, userId);
        return claimed || profile;
      } catch {
        // Organization deleted since, offline — let the prompt handle it rather
        // than blocking the sign-in. "Already has an account type" no longer
        // arrives here; claimAccountTypeFor treats it as success.
        return profile;
      }
    })();

    resolveInFlight.current.set(userId, pending);
    pending.finally(() => resolveInFlight.current.delete(userId));
    return pending;
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabaseAuth.auth.getSession();
      if (data.session) {
        setSession(data.session);
        setUser(await resolveProfile(data.session.user.id));
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

  // Safety net for a session that shows up after mount without any of the
  // sign-in functions below having run.
  //
  // The mount effect above covers the common cases, including a confirmation or
  // OAuth link: getSession() waits for detectSessionInUrl internally, so the
  // URL-delivered session is already installed by the time it resolves (checked
  // against a build without this effect, which handled that path fine). What it
  // does not cover is a session arriving later — signing in from another tab, or
  // any path that only emits an auth event. There, onAuthStateChange stores the
  // session while `user` stays null, and since the navigator needs a session AND
  // a role, the user would sit on the sign-in form while already signed in.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || user?.id === userId) return;
    let cancelled = false;
    (async () => {
      const profile = await resolveProfile(userId);
      if (!cancelled) setUser(profile);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, user?.id]);

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

  // Signed in, but the account type was never asked for. Platform admins are
  // excluded: their role is granted out of band and claim_account_type() would
  // refuse anyway, so prompting them would be a dead end.
  const rolePending = Boolean(user?.rolePending) && role !== "platform_admin";

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

    const profile = await loadProfile(data.user.id);

    if (profile?.role === "provider" && MFA_REQUIRED_PROVIDER_ROLES.includes(profile.providerRole)) {
      const { data: factors } = await supabaseAuth.auth.mfa.listFactors();
      if (!factors?.totp?.length) return { mfaEnrollmentRequired: true };
    }

    // The navigator routes on the profile's role, so without one it would keep
    // showing this form despite a valid session — a stall with nothing on
    // screen to explain it. Say so instead.
    if (!profile) {
      throw new Error("Your account has no profile yet. If you just signed up, confirm your email address first.");
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
   *
   * Returns { confirmationRequired } so the caller can tell the two outcomes
   * apart. When the project requires email confirmation, signUp creates the
   * account but returns no session: nobody is signed in, the profile row is
   * unreadable under RLS, and the navigator has nothing to route on. Treating
   * that as success looked identical to failure — the form simply sat there.
   */
  const signup = async (name, email, password, accountType, orgClaim = null) => {
    // The organization claim rides along in the same untrusted metadata as the
    // account type, and handle_new_user() treats it the same way: an id is only
    // honoured if that organization exists, a name is trimmed and length-checked,
    // and neither ever sets org_id. It has to travel this way rather than as a
    // follow-up call, because with email confirmation on there is no session
    // after signUp to authorize one.
    const claim =
      accountType === "provider" && orgClaim
        ? {
            ...(orgClaim.orgId ? { requested_org_id: orgClaim.orgId } : {}),
            ...(!orgClaim.orgId && orgClaim.orgName ? { requested_org_name: orgClaim.orgName } : {}),
          }
        : {};

    const { data, error } = await supabaseAuth.auth.signUp({
      email,
      password,
      options: {
        data: { name, account_type: accountType, ...claim },
        emailRedirectTo: buildEmailConfirmationRedirectUrl(),
      },
    });
    if (error) throw new Error(error.message);

    if (!data.session) return { confirmationRequired: true, profile: null };

    const profile = await loadProfile(data.user.id);
    setUser(profile);
    return { confirmationRequired: false, profile };
  };

  /**
   * Send the confirmation email again.
   *
   * Supabase rate-limits these per project (one per minute by default), and it
   * refuses outright for an address that is already confirmed. Both come back as
   * ordinary errors for the caller to show, which is safe here: the person
   * asking has just been told an email went to this address, so an error about
   * it reveals nothing they didn't already supply.
   */
  const resendConfirmation = async (email) => {
    const { error } = await supabaseAuth.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: buildEmailConfirmationRedirectUrl() },
    });
    if (error) throw new Error(error.message);
  };

  /**
   * Answer the account-type question for a signup that never got asked.
   *
   * Google sign-in bypasses the signup form, so handle_new_user() has no
   * account_type to work from and falls back to consumer, flagging the profile
   * as role_pending. The navigator holds those accounts at a prompt rather than
   * routing them into the wrong half of the product.
   *
   * The write goes through a database function, not a table update: the
   * authenticated role has no UPDATE grant on profiles.role precisely so a
   * signed-in user cannot self-promote to platform_admin. claim_account_type()
   * whitelists the two self-service roles and clears the flag in the same
   * statement, so it works exactly once.
   */
  /**
   * The RPC call plus a profile reload. Shared by the prompt and by the
   * parked-intent path, and deliberately state-free so callers decide what to do
   * with the result.
   *
   * userId is passed in rather than read from `session`: on the OAuth return the
   * session is installed and this runs in the same tick as setSession, so the
   * state variable is still the previous (null) value.
   */
  const claimAccountTypeFor = async ({ accountType, orgId = null, orgName = null }, userId) => {
    const { error } = await supabaseAuth.rpc("claim_account_type", {
      p_account_type: accountType,
      p_org_id: accountType === "provider" ? orgId || null : null,
      p_org_name: accountType === "provider" && !orgId ? orgName || null : null,
    });

    // "Already has an account type" is not a failure worth showing anyone: the
    // account is settled, which is the whole point of the call. It means something
    // else got there first — a concurrent resolve, a double press, or an account
    // that predates the prompt. Showing it stranded the user on a form that could
    // never succeed, so load the settled profile and let the navigator route.
    if (error && !ALREADY_CLAIMED.test(error.message || "")) throw new Error(error.message);

    return userId ? await loadProfile(userId) : null;
  };

  const claimAccountType = async (accountType, orgClaim = null) => {
    const profile = await claimAccountTypeFor(
      { accountType, orgId: orgClaim?.orgId, orgName: orgClaim?.orgName },
      session?.user?.id
    );
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

  /**
   * Hand off to Google.
   *
   * `intent` is the signup answers, when the person filled them in before
   * choosing Google rather than a password. They are parked in storage first,
   * because this call navigates the whole page away and React state does not
   * come back. resolveProfile() spends them on return.
   *
   * Called with no intent from the sign-in form, where there is nothing to carry.
   */
  const googleAuth = async (intent = null) => {
    if (intent) await saveSignupIntent(intent);
    else await clearSignupIntent();

    const { error } = await supabaseAuth.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    if (error) {
      // The redirect never happened, so the parked answers would otherwise sit
      // there waiting to be applied to some later, unrelated sign-in.
      await clearSignupIntent();
      throw new Error(error.message);
    }
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
    // Nothing half-finished should survive a sign-out and land on the next
    // person to use this browser.
    await clearSignupIntent();
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
      rolePending,
      authLoading,
      login,
      signup,
      resendConfirmation,
      claimAccountType,
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
    [location, needType, compareTray, filters, session, user, role, rolePending, authLoading, passwordRecovery, recoveryError, toast]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
