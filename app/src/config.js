import { Platform } from "react-native";
import Constants from "expo-constants";

const API_PORT = 4000;

// Hosts where an unencrypted connection is acceptable because the traffic
// never leaves the machine or the local network during development.
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|.*\.local)$/i;
const PRIVATE_IP_RE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

function isLocalHost(host) {
  return LOCAL_HOST_RE.test(host) || PRIVATE_IP_RE.test(host);
}

function devApiHost() {
  // Native (Expo Go / dev client on a phone): localhost means the phone
  // itself, not the dev machine, so derive the dev machine's LAN IP from
  // the URL Expo used to serve this bundle.
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    Constants.manifest?.debuggerHost;

  const host = hostUri ? hostUri.split(":")[0] : null;
  return host || "localhost";
}

/**
 * Where the Express backend lives.
 *
 * This used to be hardcoded to `http://<current hostname>:4000/api`, which had
 * two problems in production: every request — including the `Authorization:
 * Bearer <supabase access token>` header — travelled unencrypted over plain
 * HTTP, where anyone on the network path could lift the token and impersonate
 * the account; and port 4000 isn't reachable at all on hosting that only
 * exposes 80/443, so the app couldn't talk to its own API.
 *
 * Resolution order:
 *  1. EXPO_PUBLIC_API_BASE — set this for any real deployment. Expo inlines
 *     EXPO_PUBLIC_* variables at build time, so `expo export` bakes it in.
 *     It has to come from an app/.env file (a shell-only variable does not
 *     reliably reach the bundle), and Metro caches the substitution — rebuild
 *     with --clear after changing it. See app/.env.example.
 *  2. Web on a non-local hostname (i.e. a deployed site): same origin as the
 *     page, so it inherits the page's HTTPS, on the conventional /api path.
 *     This expects the host to proxy /api to the Node server — see README.
 *  3. Local development: plain HTTP to the dev machine, which is fine because
 *     it stays on localhost or the LAN.
 */
function resolveApiBase() {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  if (Platform.OS === "web") {
    const loc = typeof window !== "undefined" ? window.location : null;
    const host = loc?.hostname || "localhost";

    if (!isLocalHost(host)) {
      // Deployed: same-origin, same protocol as the page.
      return `${loc.origin}/api`;
    }
    return `http://${host}:${API_PORT}/api`;
  }

  // Native. __DEV__ is false in a release build, where there is no Metro host
  // to infer and no safe default — the build must supply EXPO_PUBLIC_API_BASE.
  if (!__DEV__) {
    console.error(
      "EXPO_PUBLIC_API_BASE is not set. A release build has no development server to " +
        "infer the API host from — set it (to an https:// URL) before building."
    );
  }
  return `http://${devApiHost()}:${API_PORT}/api`;
}

export const API_BASE = resolveApiBase();

if (API_BASE.startsWith("http://") && !isLocalHost(API_BASE.replace(/^https?:\/\//, "").split(/[:/]/)[0])) {
  // Loud, because this means access tokens are crossing the network in clear text.
  console.error(
    `API_BASE is using unencrypted HTTP against a non-local host (${API_BASE}). ` +
      "Authorization tokens will be sent in clear text — use https://."
  );
}

// Supabase project connection. Find these under Project Settings > API in
// your Supabase dashboard. The anon key is safe to ship in client code (it's
// designed for that) — never put the service_role key here.
export const SUPABASE_URL = "https://czelhizizienwnnopfou.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6ZWxoaXppemllbndubm9wZm91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NjczMTcsImV4cCI6MjEwMjA0MzMxN30.I-gnYruLS6gkGO91ibBXvyOm8zRjXp_DOWaDIZkuFYM";

// Google Maps JavaScript API key, used only by the web build (MapView.web.js)
// to render real Google Maps in a browser. Get this from Google Cloud
// Console > APIs & Services > Credentials, restricted to your web origin(s)
// with the "Maps JavaScript API" enabled. Native builds (Android/iOS) use a
// separate key configured in app.json instead — see the "plugins" section.
export const GOOGLE_MAPS_WEB_API_KEY = "AIzaSyAx_YdFhptqbS_-TRHreJ4vxb8smhSS81A";

// To enable "Continue with Google" (web only for now), Google sign-in is
// handled entirely by Supabase Auth:
// 1. In Google Cloud Console, create an OAuth 2.0 Client ID of type "Web application"
//    and add your Supabase project's callback URL (Authentication > Providers > Google
//    in the Supabase dashboard shows the exact redirect URL to use) as an authorized
//    redirect URI.
// 2. In the Supabase dashboard, go to Authentication > Providers > Google, enable it,
//    and paste in the Google Client ID and Client Secret from step 1.
// No Google-specific config is needed in this app — SUPABASE_URL/SUPABASE_ANON_KEY above
// are all that's required. Until those are set, the button renders in a disabled state.
