import { Platform } from "react-native";
import Constants from "expo-constants";

const API_PORT = 4000;

function resolveApiHost() {
  // Web (including Expo web / react-native-web in a desktop browser): the
  // backend is reachable on the same machine.
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.location && window.location.hostname) {
      return window.location.hostname;
    }
    return "localhost";
  }

  // Native (Expo Go / dev client on a phone): localhost means the phone
  // itself, not the dev machine, so derive the dev machine's LAN IP from
  // the URL Expo used to serve this bundle.
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    Constants.manifest?.debuggerHost;

  if (hostUri) {
    const host = hostUri.split(":")[0];
    if (host) return host;
  }

  return "localhost";
}

export const API_BASE = `http://${resolveApiHost()}:${API_PORT}/api`;

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
