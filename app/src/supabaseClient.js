import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const url = SUPABASE_URL || "https://placeholder.supabase.co";
const key = SUPABASE_ANON_KEY || "placeholder";

// One auth client, one session.
//
// This used to be three independent clients — consumer, provider, admin — each
// with its own storage key, so one person could hold a consumer session and a
// provider session simultaneously. That only made sense while each role had its
// own login screen. Now there is a single sign-in form and the account's role
// decides where it lands, so a second concurrent session has nothing to
// represent: signing in is signing in, and the role comes from the profile.
//
// The trade-off, deliberately accepted: someone who is both a consumer and a
// provider can no longer be in both at once, and must sign out to switch.
export const supabaseAuth = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    storageKey: "glp-auth",
    autoRefreshToken: true,
    persistSession: true,
    // Needed on web so a password-recovery link in the URL is exchanged for a
    // session automatically. Native has no window to read and handles the
    // deep link by hand — see deepLink.js.
    detectSessionInUrl: typeof window !== "undefined",
  },
});

export async function fetchProfile(client, userId) {
  const { data, error } = await client
    .from("profiles")
    .select(
      "id, role, name, email, orgId:org_id, providerRole:provider_role, requestUpdates:request_updates, planningResources:planning_resources, providerOffers:provider_offers, doNotContact:do_not_contact, org:orgs(name)"
    )
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const { org, ...profile } = data;
  return { ...profile, orgName: org?.name || null };
}
