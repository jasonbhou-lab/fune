import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

if (!supabaseConfigured) {
  console.warn(
    "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — fill in the .env file at the project root (see .env.example). " +
      "All data and auth routes will return 501 until then."
  );
}

// Service-role client: full access, bypasses RLS. Server-side only — never
// send this key or this client to the frontend.
export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

export function requireSupabase(res) {
  if (!supabaseConfigured) {
    res.status(501).json({ error: "Supabase is not configured on this server yet." });
    return false;
  }
  return true;
}
