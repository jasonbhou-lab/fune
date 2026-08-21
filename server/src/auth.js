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

function bearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

/**
 * Authenticate the caller, or send the failure response and return null.
 *
 * Fails closed on *any* non-null error rather than enumerating the ones we
 * expect. An earlier version only handled "invalid" and "no_profile", so a new
 * error string added to resolveUser later would have fallen through to the role
 * check with user === null and thrown a TypeError — reaching the error handler
 * instead of denying access explicitly.
 */
async function authenticate(req, res) {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing authorization token." });
    return null;
  }
  if (!supabaseConfigured) {
    res.status(501).json({ error: "Supabase is not configured on this server yet." });
    return null;
  }

  const { user, mfaSatisfied, error } = await resolveUser(token);
  if (error || !user) {
    res.status(error === "unconfigured" ? 501 : 401).json({ error: "Invalid or expired token." });
    return null;
  }
  if (!mfaSatisfied) {
    res
      .status(403)
      .json({ error: "This account requires multi-factor verification before continuing.", mfaRequired: true });
    return null;
  }
  return user;
}

export function requireAuth(role) {
  return async (req, res, next) => {
    const user = await authenticate(req, res);
    if (!user) return undefined;
    if (role && user.role !== role) return res.status(403).json({ error: "Not authorized for this resource." });
    req.user = user;
    next();
  };
}

// The organization a platform admin is currently working inside. A header rather
// than a query parameter so it cannot end up in a URL, a log line, or a Referer.
export const ACT_AS_ORG_HEADER = "x-act-as-org";

/**
 * Portal access for a provider on their own organization, or a platform admin on
 * a named one.
 *
 * Every portal route scopes its queries to req.user.orgId and never to an id
 * taken from the request body — that is what stops one provider reading
 * another's leads. Rather than duplicate fourteen endpoints so admins can reach
 * the same data, this sets that one field, and the routes need no knowledge of
 * it at all.
 *
 * The privilege is narrow by construction: only a platform_admin may name an
 * organization, the name is ignored entirely for providers (so a provider
 * sending the header still only ever sees their own), and the organization has
 * to exist. What it deliberately does grant is real: an admin working inside a
 * provider's portal can read that organization's leads, which carry bereaved
 * families' names, phone numbers and circumstances. Hence actingAsOrg below,
 * which the portal router uses to record every write.
 */
export function requirePortalAccess() {
  return async (req, res, next) => {
    const user = await authenticate(req, res);
    if (!user) return undefined;

    if (user.role === "provider") {
      req.user = user;
      return next();
    }
    if (user.role !== "platform_admin") {
      return res.status(403).json({ error: "Not authorized for this resource." });
    }

    const raw = req.headers[ACT_AS_ORG_HEADER];
    const orgId = typeof raw === "string" && raw.length <= 64 ? raw.trim() : null;
    if (!orgId) {
      // Distinguishable from a plain 400 so the admin UI can prompt for a
      // choice rather than showing a validation error.
      return res.status(400).json({ error: "Choose an organization to work on first.", chooseOrganization: true });
    }

    const { data: org, error } = await supabase.from("orgs").select("id, name").eq("id", orgId).maybeSingle();
    if (error || !org) return res.status(404).json({ error: "Organization not found." });

    req.user = { ...user, orgId: org.id, actingAsOrg: org };
    return next();
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
