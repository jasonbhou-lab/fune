import React from "react";
import { Platform, View, Text, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { supabaseConfigured } from "../supabaseClient";
import { type } from "../theme";

function GoogleLogo({ size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path
        d="M19.6 10.23c0-.68-.06-1.36-.17-2H10v3.79h5.48a4.68 4.68 0 01-2.04 3.07v2.55h3.3c1.93-1.78 3.04-4.4 3.04-7.41z"
        fill="#4285F4"
      />
      <Path
        d="M10 20c2.7 0 4.96-.89 6.62-2.42l-3.3-2.55c-.92.62-2.1.98-3.32.98-2.56 0-4.72-1.72-5.5-4.04H1.1v2.6A10 10 0 0010 20z"
        fill="#34A853"
      />
      <Path d="M4.5 11.97a5.99 5.99 0 010-3.94V5.44H1.1a10 10 0 000 9.13l3.4-2.6z" fill="#FBBC05" />
      <Path
        d="M10 3.98c1.47 0 2.79.5 3.83 1.49l2.87-2.87A9.96 9.96 0 0010 0 10 10 0 001.1 5.44l3.4 2.6C5.28 5.72 7.44 3.98 10 3.98z"
        fill="#EA4335"
      />
    </Svg>
  );
}

// Google sign-in is handled entirely by Supabase Auth's OAuth redirect flow
// (see AppState.js's consumerGoogleAuth) — this component is just the button.
// Configuring the Google provider itself happens in the Supabase dashboard
// (Authentication > Providers > Google), not in this app's code. Styling
// follows Google's official sign-in button branding guidelines.
export default function GoogleSignInButton({ onPress }) {
  const configured = Platform.OS === "web" && supabaseConfigured;

  return (
    <View>
      <Pressable
        onPress={configured ? onPress : undefined}
        disabled={!configured}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: "#DADCE0",
          borderRadius: 12,
          paddingVertical: 14,
          paddingHorizontal: 24,
          opacity: configured ? (pressed ? 0.85 : 1) : 0.5,
        })}
      >
        <GoogleLogo />
        <Text style={{ color: "#3C4043", fontSize: 16, fontWeight: "500" }}>Continue with Google</Text>
      </Pressable>
      {!configured ? (
        <Text style={[type.caption, { marginTop: 6, textAlign: "center" }]}>
          {Platform.OS === "web" ? "Google sign-in isn't set up yet for this app." : "Google sign-in is web-only for now."}
        </Text>
      ) : null}
    </View>
  );
}
