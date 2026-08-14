import React from "react";
import { Platform, View, Text } from "react-native";
import { SecondaryButton } from "./ui";
import { supabaseConfigured } from "../supabaseClient";
import { type } from "../theme";

// Google sign-in is handled entirely by Supabase Auth's OAuth redirect flow
// (see AppState.js's consumerGoogleAuth) — this component is just the button.
// Configuring the Google provider itself happens in the Supabase dashboard
// (Authentication > Providers > Google), not in this app's code.
export default function GoogleSignInButton({ onPress }) {
  const configured = Platform.OS === "web" && supabaseConfigured;

  if (!configured) {
    return (
      <View>
        <SecondaryButton title="Continue with Google" disabled />
        <Text style={[type.caption, { marginTop: 6, textAlign: "center" }]}>
          {Platform.OS === "web" ? "Google sign-in isn't set up yet for this app." : "Google sign-in is web-only for now."}
        </Text>
      </View>
    );
  }

  return <SecondaryButton title="Continue with Google" onPress={onPress} />;
}
