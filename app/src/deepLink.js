import { Platform } from "react-native";

// Custom URL scheme registered in app.json. The OS uses it to route
// glp://... links back into this app.
export const APP_SCHEME = "glp";

// Path the password-reset email returns to. Nothing routes on it today — the
// gate decides what to show from the recovery flag — but it keeps the link
// self-describing and gives us somewhere to hang other flows later.
export const RESET_PASSWORD_PATH = "reset-password";

/**
 * Where Supabase should send the user after they click a reset link.
 *
 * On web that's the page origin, which is what the browser can load. On native
 * there is no origin, so it has to be the app's own scheme or the OS has
 * nothing to hand the link to and it opens in a browser instead — which is
 * exactly the gap this closes.
 *
 * Deliberately not using expo-linking's createURL(): the only thing it adds
 * here is Expo Go's exp:// form, and this app already requires a dev client
 * (react-native-maps is a native module), so Expo Go is not a target. Avoiding
 * it keeps this dependency-free and means no extra native module to link.
 */
export function buildPasswordResetRedirectUrl() {
  if (Platform.OS === "web") {
    return typeof window !== "undefined" ? window.location.origin : undefined;
  }
  return `${APP_SCHEME}://${RESET_PASSWORD_PATH}`;
}

/**
 * Where Supabase should send someone after they click the confirmation link in
 * a signup email.
 *
 * Web returns the page origin, so the link lands back on whichever deployment
 * they actually signed up on rather than whatever the project's Site URL
 * happens to be. Note the origin still has to appear in the project's allowed
 * Redirect URLs, or Supabase ignores it and uses Site URL anyway.
 *
 * Native deliberately returns undefined rather than glp://. A confirmation link
 * pointed at the app's own scheme would be handed to the native deep-link
 * handler, which only understands recovery links, so the session would be
 * dropped on the floor. Falling back to Site URL means confirmation completes in
 * a browser and the user then signs in inside the app with their password, which
 * works today without a new native flow.
 */
export function buildEmailConfirmationRedirectUrl() {
  if (Platform.OS === "web") {
    return typeof window !== "undefined" ? window.location.origin : undefined;
  }
  return undefined;
}

/**
 * Pull auth parameters out of a URL, whether they arrive in the query string or
 * the fragment.
 *
 * Which one it is depends on the flow: supabase-js defaults to the implicit
 * flow, which returns `#access_token=...&refresh_token=...&type=recovery`,
 * while PKCE returns `?code=...`. Reading both means this keeps working if
 * flowType is ever switched, and mobile hands us the whole URL including the
 * fragment either way.
 *
 * Returns a plain object of the parameters found. Null-prototype so a parameter
 * literally named __proto__ can't reach Object.prototype.
 */
export function parseAuthParamsFromUrl(url) {
  const out = Object.create(null);
  if (typeof url !== "string" || !url) return out;

  for (const marker of ["?", "#"]) {
    const at = url.indexOf(marker);
    if (at === -1) continue;
    // Take everything after the marker, stopping at the other marker if the
    // query comes before the fragment.
    let segment = url.slice(at + 1);
    const otherMarker = marker === "?" ? "#" : "?";
    const cut = segment.indexOf(otherMarker);
    if (cut !== -1) segment = segment.slice(0, cut);

    for (const pair of segment.split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      const rawValue = eq === -1 ? "" : pair.slice(eq + 1);
      if (!rawKey) continue;
      try {
        out[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/\+/g, " "));
      } catch {
        // A malformed percent-escape shouldn't discard the rest of the URL.
        out[rawKey] = rawValue;
      }
    }
  }

  return out;
}

/** True when a deep link is Supabase handing back a password-recovery result. */
export function isPasswordRecoveryUrl(url) {
  const p = parseAuthParamsFromUrl(url);
  // `type=recovery` is what Supabase tags the link with. A PKCE `code` carries
  // no type, so fall back to the path we asked it to return to.
  if (p.type === "recovery") return true;
  if (p.code && typeof url === "string" && url.includes(RESET_PASSWORD_PATH)) return true;
  // An expired or already-used link comes back with an error and no type at
  // all. Treated as a recovery URL so the user gets told what happened —
  // otherwise the app opens on the normal gate and silently discards it, which
  // is the most common way this flow fails.
  if (p.error && typeof url === "string" && url.includes(RESET_PASSWORD_PATH)) return true;
  return false;
}

/**
 * Human-readable failure from a recovery link, or null if there isn't one.
 * Supabase's own error_description is reasonable prose, so prefer it and only
 * fall back to the code.
 */
export function describeAuthError(params) {
  if (!params || !params.error) return null;
  if (params.error_code === "otp_expired") {
    return "That reset link has expired. Request a new one below.";
  }
  const detail = params.error_description || params.error_code || params.error;
  return `That reset link could not be used: ${detail}`;
}
