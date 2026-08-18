import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { TextField, PrimaryButton, SecondaryButton, Banner } from "../../components/ui";
import GoogleSignInButton from "../../components/GoogleSignInButton";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";
import { useContentWidth } from "../../responsive";

// Supabase enforces its own minimum (6 by default, configurable per project).
// Requiring a little more here gives a clear message before the round trip
// rather than surfacing a server-side rejection.
const MIN_PASSWORD_LENGTH = 8;

// signup | login | forgot | reset
//   forgot — asking for the address to email a recovery link to
//   reset  — arrived from that email, choosing the new password
export default function SignInScreen({ navigation }) {
  const {
    consumerLogin,
    consumerSignup,
    consumerGoogleAuth,
    passwordRecovery,
    recoveryError,
    clearRecoveryError,
    consumerRequestPasswordReset,
    consumerCompletePasswordReset,
    consumerCancelPasswordReset,
  } = useAppState();
  const contentWidth = useContentWidth();
  const [mode, setMode] = useState("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  // Opening the app from a reset email lands here with a recovery session
  // already established, so jump straight to choosing a new password.
  useEffect(() => {
    if (passwordRecovery) {
      setMode("reset");
      setError(null);
      setNotice(null);
      setPassword("");
      setConfirmPassword("");
    }
  }, [passwordRecovery]);

  // A link that came back expired or already-used can't be completed, so send
  // the user to the request form with the reason visible rather than showing a
  // password form that would fail on submit.
  useEffect(() => {
    if (recoveryError) {
      setMode("forgot");
      setError(recoveryError);
      setNotice(null);
    }
  }, [recoveryError]);

  const go = (next) => {
    setMode(next);
    clearRecoveryError?.();
    setError(null);
    setNotice(null);
    setPassword("");
    setConfirmPassword("");
  };

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

  const sendResetLink = async () => {
    setError(null);
    setNotice(null);
    const address = email.trim();
    if (!address) {
      setError("Enter the email address for your account.");
      return;
    }
    setLoading(true);
    try {
      await consumerRequestPasswordReset(address);
      clearRecoveryError?.();
      // Worded so it reveals nothing about whether the address has an account —
      // see consumerRequestPasswordReset for why that matters here.
      setNotice(`If an account exists for ${address}, a reset link is on its way. The link expires after a short while.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const applyNewPassword = async () => {
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Those passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await consumerCompletePasswordReset(password);
      // consumerCompletePasswordReset clears the recovery flag, so the
      // navigator now lets the (already signed-in) session through.
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const abandonReset = async () => {
    setError(null);
    try {
      await consumerCancelPasswordReset();
      setMode("login");
    } catch (e) {
      setError(e.message);
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
  const fieldLabelColor = "rgba(255,255,255,0.85)";

  const heading =
    mode === "login" ? "Sign in" : mode === "forgot" ? "Reset your password" : mode === "reset" ? "Choose a new password" : "Create an account";

  return (
    <LinearGradient colors={[colors.primary, colors.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[{ flexGrow: 1, padding: spacing.lg, paddingTop: spacing.xxl, width: "100%" }, contentWidth]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[type.display, onGradient]}>GLP</Text>
        <Text style={[type.caption, onGradientMuted, { marginTop: 4, marginBottom: spacing.xl }]}>Compare with clarity.</Text>

        <Text style={[type.h2, onGradient, { marginBottom: spacing.md }]}>{heading}</Text>
        {error ? <Banner tone="danger">{error}</Banner> : null}
        {notice ? <Banner tone="warn">{notice}</Banner> : null}

        {mode === "forgot" ? (
          <>
            <Text style={[type.caption, onGradientMuted, { marginBottom: spacing.md }]}>
              Enter the email address on your account and we'll send you a link to set a new password.
            </Text>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              labelColor={fieldLabelColor}
            />
            <PrimaryButton
              title="Send reset link"
              onPress={sendResetLink}
              loading={loading}
              style={{ marginTop: spacing.sm, backgroundColor: colors.ink }}
            />
            <Pressable onPress={() => go("login")} style={{ marginTop: spacing.lg }}>
              <Text style={[onGradient, { textAlign: "center", fontWeight: "700" }]}>Back to sign in</Text>
            </Pressable>
          </>
        ) : mode === "reset" ? (
          <>
            <Text style={[type.caption, onGradientMuted, { marginBottom: spacing.md }]}>
              This link signed you in. Pick a new password to finish — it replaces the old one everywhere.
            </Text>
            <TextField
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              labelColor={fieldLabelColor}
            />
            <TextField
              label="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              labelColor={fieldLabelColor}
            />
            <PrimaryButton
              title="Update password"
              onPress={applyNewPassword}
              loading={loading}
              style={{ marginTop: spacing.sm, backgroundColor: colors.ink }}
            />
            <Pressable onPress={abandonReset} style={{ marginTop: spacing.lg }}>
              <Text style={[onGradient, { textAlign: "center", fontWeight: "700" }]}>Cancel and sign out</Text>
            </Pressable>
          </>
        ) : (
          <>
            {mode === "signup" ? (
              <TextField label="Name" value={name} onChangeText={setName} labelColor={fieldLabelColor} />
            ) : null}
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              labelColor={fieldLabelColor}
            />
            <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry labelColor={fieldLabelColor} />
            <PrimaryButton
              title={mode === "login" ? "Sign in" : "Create account"}
              onPress={submit}
              loading={loading}
              style={{ marginTop: spacing.sm, backgroundColor: colors.ink }}
            />
            <Pressable onPress={() => go("forgot")} style={{ marginTop: spacing.md }}>
              <Text style={[onGradientMuted, { textAlign: "center", fontWeight: "600" }]}>Forgot password?</Text>
            </Pressable>
            <Pressable onPress={() => go(mode === "login" ? "signup" : "login")} style={{ marginTop: spacing.md }}>
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
          </>
        )}

        <View style={{ flex: 1 }} />

        {/* Hidden mid-reset: sending someone to a different sign-in while they
            hold an unfinished recovery session is a good way to lose them. */}
        {mode === "reset" ? null : (
          <>
            <Text style={[type.label, onGradientMuted, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>For providers</Text>
            <SecondaryButton title="Provider portal sign in" onPress={() => navigation.navigate("PortalLogin")} />

            <Text style={[type.label, onGradientMuted, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>For platform staff</Text>
            <SecondaryButton title="Platform admin sign in" onPress={() => navigation.navigate("AdminLogin")} />
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}
