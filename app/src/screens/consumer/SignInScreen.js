import React, { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { TextField, PrimaryButton, SecondaryButton, Banner } from "../../components/ui";
import GoogleSignInButton from "../../components/GoogleSignInButton";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";
import { useContentWidth } from "../../responsive";

export default function SignInScreen({ navigation }) {
  const { consumerLogin, consumerSignup, consumerGoogleAuth } = useAppState();
  const contentWidth = useContentWidth();
  const [mode, setMode] = useState("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await consumerLogin(email.trim(), password);
      } else {
        await consumerSignup(name.trim(), email.trim(), password);
      }
      // No further navigation needed — once the token is set, the root
      // navigator swaps this screen out for the main app automatically.
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    try {
      await consumerGoogleAuth();
      // On web this navigates away to Google immediately; nothing more to do here.
    } catch (e) {
      setError(e.message);
    }
  };

  const onGradient = { color: colors.primaryInk };
  const onGradientMuted = { color: "rgba(255,255,255,0.8)" };

  return (
    <LinearGradient colors={[colors.primary, colors.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[{ flexGrow: 1, padding: spacing.lg, paddingTop: spacing.xxl, width: "100%" }, contentWidth]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[type.display, onGradient]}>GLP</Text>
        <Text style={[type.caption, onGradientMuted, { marginTop: 4, marginBottom: spacing.xl }]}>Compare with clarity.</Text>

        <Text style={[type.h2, onGradient, { marginBottom: spacing.md }]}>{mode === "login" ? "Sign in" : "Create an account"}</Text>
        {error ? <Banner tone="danger">{error}</Banner> : null}
        {mode === "signup" ? <TextField label="Name" value={name} onChangeText={setName} labelColor="rgba(255,255,255,0.85)" /> : null}
        <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" labelColor="rgba(255,255,255,0.85)" />
        <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry labelColor="rgba(255,255,255,0.85)" />
        <PrimaryButton
          title={mode === "login" ? "Sign in" : "Create account"}
          onPress={submit}
          loading={loading}
          style={{ marginTop: spacing.sm, backgroundColor: colors.ink }}
        />
        <Pressable onPress={() => setMode(mode === "login" ? "signup" : "login")} style={{ marginTop: spacing.lg }}>
          <Text style={[onGradient, { textAlign: "center", fontWeight: "700" }]}>
            {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
          </Text>
        </Pressable>

        <View style={{ flexDirection: "row", alignItems: "center", marginVertical: spacing.lg }}>
          <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.4)" }} />
          <Text style={[type.caption, onGradientMuted, { marginHorizontal: spacing.sm }]}>or</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.4)" }} />
        </View>
        <GoogleSignInButton onPress={handleGoogleSignIn} />

        <View style={{ flex: 1 }} />

        <Text style={[type.label, onGradientMuted, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>For providers</Text>
        <SecondaryButton title="Provider portal sign in" onPress={() => navigation.navigate("PortalLogin")} />

        <Text style={[type.label, onGradientMuted, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>For platform staff</Text>
        <SecondaryButton title="Platform admin sign in" onPress={() => navigation.navigate("AdminLogin")} />
      </ScrollView>
    </LinearGradient>
  );
}
