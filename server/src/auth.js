import { supabase, supabaseConfigured } from "./supabaseClient.js";

const MFA_REQUIRED_PROVIDER_ROLES = ["owner", "administrator"];

function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

async function resolveUser(token) {
  if (!token || !supabaseConfigured) return { user: null, error: "unconfigured" };

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { user: null, error: "invalid" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, orgId:org_id, providerRole:provider_role, name")
    .eq("id", data.user.id)
    .single();
  if (profileError || !profile) return { user: null, error: "no_profile" };

  const claims = decodeJwtPayload(token);
  const requiresMfa = profile.role === "provider" && MFA_REQUIRED_PROVIDER_ROLES.includes(profile.providerRole);
  const mfaSatisfied = !requiresMfa || claims?.aal === "aal2";

  return {
    user: { ...profile, email: data.user.email },
    mfaSatisfied,
    error: null,
  };
}

export function requireAuth(role) {
  return async (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing authorization token." });
    if (!supabaseConfigured) return res.status(501).json({ error: "Supabase is not configured on this server yet." });

    const { user, mfaSatisfied, error } = await resolveUser(token);
    if (error === "invalid") return res.status(401).json({ error: "Invalid or expired token." });
    if (error === "no_profile") return res.status(401).json({ error: "No profile found for this account." });
    if (role && user.role !== role) return res.status(403).json({ error: "Not authorized for this resource." });
    if (!mfaSatisfied) {
      return res.status(403).json({ error: "This account requires multi-factor verification before continuing.", mfaRequired: true });
    }

    req.user = user;
    next();
  };
}

export async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const { user } = await resolveUser(token);
  req.user = user;
  next();
}
