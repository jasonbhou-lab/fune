import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SvgXml } from "react-native-svg";
import { TextField, PrimaryButton, Banner } from "../../components/ui";
import GoogleSignInButton from "../../components/GoogleSignInButton";
import { useAppState, SELF_SERVICE_ACCOUNT_TYPES } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";
import { useContentWidth } from "../../responsive";

// Supabase enforces its own minimum (6 by default, configurable per project).
// Requiring a little more here gives a clear message before the round trip.
const MIN_PASSWORD_LENGTH = 8;

// The single entry point for every role.
//
// There used to be three: this gate for consumers, plus separate "Provider
// portal sign in" and "Platform admin sign in" screens reached by buttons at
// the bottom. Now one email/password pair serves all three, the account's role
// comes from its profile, and RootNavigator sends them to the matching area.
//
// mode: signup | login | forgot | reset | mfa | mfaEnroll
export default function SignInScreen() {
  const {
    login,
    signup,
    googleAuth,
    verifyMfa,
    enrollMfa,
    completeMfaEnrollment,
    passwordRecovery,
    recoveryError,
    clearRecoveryError,
    requestPasswordReset,
    completePasswordReset,
    cancelPasswordReset,
  } = useAppState();
  const contentWidth = useContentWidth();

  const [mode, setMode] = useState("signup");
  const [accountType, setAccountType] = useState(SELF_SERVICE_ACCOUNT_TYPES[0].id);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState(null);
  const [enrollment, setEnrollment] = useState(null); // { factorId, qrSvg, secret }
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);

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
  // the user to the request form with the reason visible.
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
    setCode("");
  };

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const result = await login(email.trim(), password);
        // Privileged accounts get a second step before the navigator lets them
        // through. Anything else is already signed in and RootNavigator swaps
        // this screen out for the area matching the profile's role.
        if (result?.mfaRequired) {
          setFactorId(result.factorId);
          setCode("");
          setMode("mfa");
        } else if (result?.mfaEnrollmentRequired) {
          const details = await enrollMfa();
          setEnrollment(details);
          setCode("");
          setMode("mfaEnroll");
        }
      } else {
        if (password.length < MIN_PASSWORD_LENGTH) {
          setError(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
          return;
        }
        await signup(name.trim(), email.trim(), password, accountType);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const submitMfaCode = async () => {
    setError(null);
    setLoading(true);
    try {
      await verifyMfa(factorId, code.trim());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const submitEnrollmentCode = async () => {
    setError(null);
    setLoading(true);
    try {
      await verifyMfa(enrollment.factorId, code.trim());
      await completeMfaEnrollment();
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
      await requestPasswordReset(address);
      clearRecoveryError?.();
      // Worded so it reveals nothing about whether the address has an account.
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
      await completePasswordReset(password);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    try {
      await googleAuth();
    } catch (e) {
      setError(e.message);
    }
  };

  const onGradient = { color: colors.primaryInk };
  const onGradientMuted = { color: "rgba(255,255,255,0.8)" };
  const fieldLabelColor = "rgba(255,255,255,0.85)";

  const heading = {
    login: "Sign in",
    signup: "Create an account",
    forgot: "Reset your password",
    reset: "Choose a new password",
    mfa: "Verify it's you",
    mfaEnroll: "Set up two-factor authentication",
  }[mode];

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

        {mode === "mfaEnroll" ? (
          <>
            <Text style={[type.caption, onGradientMuted, { marginBottom: spacing.lg }]}>
              This account's role requires it. Scan this code with an authenticator app (Google Authenticator, Authy,
              1Password), then enter the 6-digit code it shows.
            </Text>
            <View style={{ alignItems: "center", marginBottom: spacing.lg }}>
              <View style={{ backgroundColor: "#FFFFFF", padding: spacing.sm, borderRadius: 10 }}>
                <SvgXml xml={enrollment.qrSvg} width={180} height={180} />
              </View>
              <Text style={[type.caption, onGradientMuted, { marginTop: spacing.sm, textAlign: "center" }]}>
                Can't scan it? Enter this key manually: {enrollment.secret}
              </Text>
            </View>
            <TextField label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" labelColor={fieldLabelColor} />
            <PrimaryButton
              title="Verify and finish setup"
              onPress={submitEnrollmentCode}
              loading={loading}
              style={{ marginTop: spacing.sm, backgroundColor: colors.ink }}
            />
          </>
        ) : mode === "mfa" ? (
          <>
            <Text style={[type.caption, onGradientMuted, { marginBottom: spacing.md }]}>
              Enter the 6-digit code from your authenticator app.
            </Text>
            <TextField label="Verification code" value={code} onChangeText={setCode} keyboardType="number-pad" labelColor={fieldLabelColor} />
            <PrimaryButton
              title="Verify"
              onPress={submitMfaCode}
              loading={loading}
              style={{ marginTop: spacing.sm, backgroundColor: colors.ink }}
            />
            <Pressable onPress={() => go("login")} style={{ marginTop: spacing.lg }}>
              <Text style={[onGradient, { textAlign: "center", fontWeight: "700" }]}>Back to sign in</Text>
            </Pressable>
          </>
        ) : mode === "forgot" ? (
          <>
            <Text style={[type.caption, onGradientMuted, { marginBottom: spacing.md }]}>
              Enter the email address on your account and we'll send you a link to set a new password.
            </Text>
            <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" labelColor={fieldLabelColor} />
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
            <TextField label="New password" value={password} onChangeText={setPassword} secureTextEntry labelColor={fieldLabelColor} />
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
            <Pressable onPress={cancelPasswordReset} style={{ marginTop: spacing.lg }}>
              <Text style={[onGradient, { textAlign: "center", fontWeight: "700" }]}>Cancel and sign out</Text>
            </Pressable>
          </>
        ) : (
          <>
            {mode === "signup" ? (
              <>
                {/* The account type decides where this person lands after every
                    future sign-in. Only the two self-service roles appear;
                    platform admins are provisioned directly, and the database
                    whitelist ignores any other value that reaches it. */}
                <Text style={[type.label, onGradientMuted, { marginBottom: spacing.sm }]}>Which describes you?</Text>
                {SELF_SERVICE_ACCOUNT_TYPES.map((opt) => {
                  const active = accountType === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => setAccountType(opt.id)}
                      style={{
                        borderWidth: 1,
                        borderColor: active ? colors.primaryInk : "rgba(255,255,255,0.45)",
                        backgroundColor: active ? "rgba(255,255,255,0.18)" : "transparent",
                        borderRadius: 10,
                        padding: 12,
                        marginBottom: spacing.sm,
                      }}
                    >
                      <Text style={[onGradient, { fontWeight: active ? "700" : "500" }]}>
                        {active ? "● " : "○ "}
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
                <View style={{ marginBottom: spacing.md }} />
                <TextField label="Name" value={name} onChangeText={setName} labelColor={fieldLabelColor} />
              </>
            ) : null}
            <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" labelColor={fieldLabelColor} />
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
            {mode === "signup" ? (
              <Text style={[type.caption, onGradientMuted, { marginTop: spacing.sm, textAlign: "center" }]}>
                Google sign-up creates a consumer account.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}
