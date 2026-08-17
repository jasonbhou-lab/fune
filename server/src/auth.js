import { supabase, supabaseConfigured } from "./supabaseClient.js";

const MFA_REQUIRED_PROVIDER_ROLES = ["owner", "administrator"];

// Platform admins are the most privileged role in the system — they can
// verify organizations, unpublish listings, and read the full audit log — yet
// they were the only privileged role with no step-up requirement. Turn this on
// (REQUIRE_ADMIN_MFA=true) once the platform-admin accounts have actually
// enrolled a second factor in Supabase, otherwise those accounts lock out.
const REQUIRE_ADMIN_MFA = String(process.env.REQUIRE_ADMIN_MFA || "").toLowerCase() === "true";

function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

async function resolveUser(token) {
  if (!token || !supabaseConfigured) return { user: null, mfaSatisfied: false, error: "unconfigured" };

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { user: null, mfaSatisfied: false, error: "invalid" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, orgId:org_id, providerRole:provider_role, name")
    .eq("id", data.user.id)
    .single();
  if (profileError || !profile) return { user: null, mfaSatisfied: false, error: "no_profile" };

  // Reading claims out of the token without verifying the signature locally is
  // safe only because getUser() above already validated this exact token
  // string against Supabase. Order matters: never move this earlier.
  const claims = decodeJwtPayload(token);
  const requiresMfa =
    (profile.role === "provider" && MFA_REQUIRED_PROVIDER_ROLES.includes(profile.providerRole)) ||
    (profile.role === "platform_admin" && REQUIRE_ADMIN_MFA);
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
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    if (!token) return res.status(401).json({ error: "Missing authorization token." });
    if (!supabaseConfigured) return res.status(501).json({ error: "Supabase is not configured on this server yet." });

    const { user, mfaSatisfied, error } = await resolveUser(token);

    // Fail closed on *any* non-null error rather than enumerating the ones we
    // expect. The previous version only handled "invalid" and "no_profile",
    // so a new error string added to resolveUser later would have fallen
    // through to the role check with user === null and thrown a TypeError —
    // reaching the error handler instead of denying access explicitly.
    if (error || !user) {
      const status = error === "unconfigured" ? 501 : 401;
      return res.status(status).json({ error: "Invalid or expired token." });
    }
    if (role && user.role !== role) return res.status(403).json({ error: "Not authorized for this resource." });
    if (!mfaSatisfied) {
      return res
        .status(403)
        .json({ error: "This account requires multi-factor verification before continuing.", mfaRequired: true });
    }

    req.user = user;
    next();
  };
}

export async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) {
    req.user = null;
    return next();
  }

  // An anonymous-capable route must not 500 because token validation had a
  // transient failure — degrade to anonymous instead.
  try {
    const { user, mfaSatisfied } = await resolveUser(token);
    req.user = user && mfaSatisfied ? user : null;
  } catch (err) {
    console.error("optionalAuth token check failed:", err);
    req.user = null;
  }
  next();
}
