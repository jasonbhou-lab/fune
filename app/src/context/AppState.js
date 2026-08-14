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

    const { data: subC } = supabaseConsumer.auth.onAuthStateChange((_event, session) => {
      setConsumerSession(session);
      if (!session) setConsumerUser(null);
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

  const consumerLogout = async () => {
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
    [location, needType, compareTray, filters, consumerToken, consumerUser, authLoading, providerToken, providerUser, adminToken, adminUser, toast]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
