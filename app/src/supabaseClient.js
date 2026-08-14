import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const url = SUPABASE_URL || "https://placeholder.supabase.co";
const key = SUPABASE_ANON_KEY || "placeholder";

// Three independent Supabase Auth clients — one per role (consumer, provider,
// platform admin) — each with its own storage key. This lets someone be
// signed in as a consumer AND as a provider (or admin) at the same time in
// the same app instance, matching how the rest of this app already treats
// those as separate, coexisting sessions rather than one unified login.
function makeClient(storageKey, detectSessionInUrl) {
  return createClient(url, key, {
    auth: { storage: AsyncStorage, storageKey, autoRefreshToken: true, persistSession: true, detectSessionInUrl },
  });
}

// Only the consumer client needs to watch for an OAuth redirect (Google
// sign-in is consumer-only for now).
export const supabaseConsumer = makeClient("fpc-consumer-auth", typeof window !== "undefined");
export const supabaseProvider = makeClient("fpc-provider-auth", false);
export const supabaseAdmin = makeClient("fpc-admin-auth", false);

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
