import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SvgXml } from "react-native-svg";
import { TextField, PrimaryButton, Banner, Card, Wordmark } from "../../components/ui";
import GoogleSignInButton from "../../components/GoogleSignInButton";
import OrgPicker from "../../components/OrgPicker";
import { useAppState, SELF_SERVICE_ACCOUNT_TYPES } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";
import { useContentWidth } from "../../responsive";

// Supabase enforces its own minimum (6 by default, configurable per project).
// Requiring a little more here gives a clear message before the round trip.
const MIN_PASSWORD_LENGTH = 8;

// Matches Supabase's default one-email-per-minute limit, so the button is only
// tappable when a resend can actually succeed.
const RESEND_COOLDOWN_SECONDS = 60;

// The single entry point for every role.
//
// There used to be three: this gate for consumers, plus separate "Provider
// portal sign in" and "Platform admin sign in" screens reached by buttons at
// the bottom. Now one email/password pair serves all three, the account's role
// comes from its profile, and RootNavigator sends them to the matching area.
//
// mode: signup | confirm | login | forgot | reset | mfa | mfaEnroll
export default function SignInScreen() {
  const {
    login,
    signup,
    resendConfirmation,
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
  // Starts unset on purpose. Defaulting to the first option meant anyone who
  // skipped past the question silently became a consumer, and the account type
  // decides which half of the product they get for good — a provider who lands
  // in the consumer app has no way to fix it from the UI. Nothing is preselected
  // and submitting without an answer is refused.
  const [accountType, setAccountType] = useState(null);
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
  // The address a confirmation email just went to. Held separately from `email`
  // so the confirm screen keeps naming the right address even if the field is
  // edited afterwards.
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendIn, setResendIn] = useState(0);
  // { orgId, orgName } — only collected for providers. See OrgPicker.
  const [orgClaim, setOrgClaim] = useState(null);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

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
    setNotice(null);
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
        // Checked before the password so the first thing on the form is also the
        // first thing complained about.
        if (!accountType) {
          setError("Choose which describes you before creating an account.");
          return;
        }
        // A provider account with no organization can do nothing in the portal,
        // so the claim is required rather than optional.
        if (accountType === "provider" && !orgClaim?.orgId && !orgClaim?.orgName) {
          setError("Choose your organization, or enter its name if it isn't listed.");
          return;
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
          setError(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
          return;
        }
        const address = email.trim();
        const result = await signup(name.trim(), address, password, accountType, orgClaim);
        // No session means the account exists but has to be confirmed by email
        // before it can sign in, so the navigator will not move. Hand over to a
        // screen dedicated to explaining that, rather than a banner above a form
        // that now looks like it did nothing.
        if (result?.confirmationRequired) {
          setPendingEmail(address);
          setPassword("");
          setResendIn(RESEND_COOLDOWN_SECONDS);
          setMode("confirm");
        }
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

  const resendConfirmationEmail = async () => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await resendConfirmation(pendingEmail);
      setNotice(`Sent again to ${pendingEmail}. Give it a minute to arrive.`);
      setResendIn(RESEND_COOLDOWN_SECONDS);
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

  // The same required answers as the email path. Signing up with Google skips
  // the password, not the questions: an account still needs to know which half
  // of the product it belongs to, and a provider still needs an organization.
  const signupAnswersMissing =
    mode === "signup" &&
    (!accountType || (accountType === "provider" && !orgClaim?.orgId && !orgClaim?.orgName));

  const handleGoogleSignIn = async () => {
    setError(null);
    if (signupAnswersMissing) {
      // Left enabled and answered with a message rather than disabled, so it is
      // clear WHY it did nothing.
      setError(
        !accountType
          ? "Choose which describes you before continuing with Google."
          : "Choose your organization, or enter its name if it isn't listed."
      );
      return;
    }
    try {
      // On the signup form the answers are carried through the Google round trip
      // so they aren't asked twice. On the sign-in form there is nothing to carry.
      await googleAuth(
        mode === "signup"
          ? { accountType, orgId: orgClaim?.orgId || null, orgName: orgClaim?.orgId ? null : orgClaim?.orgName || null }
          : null
      );
    } catch (e) {
      setError(e.message);
    }
  };

  const onGradient = { color: colors.primaryInk };
  const onGradientMuted = { color: "rgba(255,255,255,0.8)" };
  const fieldLabelColor = "rgba(255,255,255,0.85)";

  // True only once they've tried to submit without answering, so the question
  // isn't already flagged red the first time they see it.
  const accountTypeMissing = mode === "signup" && !accountType && Boolean(error);

  const heading = {
    login: "Sign in",
    signup: "Create an account",
    confirm: "Check your email",
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
        <Wordmark onDark style={{ marginBottom: spacing.xl }} />

        <Text style={[type.h2, onGradient, { marginBottom: spacing.md }]}>{heading}</Text>
        {error ? <Banner tone="danger">{error}</Banner> : null}
        {notice ? <Banner tone="warn">{notice}</Banner> : null}

        {mode === "confirm" ? (
          <>
            <Text style={[type.caption, onGradientMuted, { marginBottom: spacing.md, fontSize: 13, lineHeight: 19 }]}>
              Your account is created, but it stays locked until you confirm the address it's registered to. That keeps
              anyone from signing up with an email they don't own.
            </Text>

            <Card style={{ marginBottom: spacing.md }}>
              <Text style={type.label}>Confirmation sent to</Text>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink, marginTop: 4, marginBottom: spacing.md }}>
                {pendingEmail}
              </Text>

              <Text style={type.label}>What to do next</Text>
              <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                {[
                  "Open the email from us. It usually arrives within a minute.",
                  "Tap the confirmation link inside it.",
                  "That link brings you straight back here, already signed in.",
                ].map((step, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: spacing.sm }}>
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: colors.primary,
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Text style={{ color: colors.primaryInk, fontSize: 11, fontWeight: "700" }}>{i + 1}</Text>
                    </View>
                    <Text style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 19, color: colors.muted }}>{step}</Text>
                  </View>
                ))}
              </View>

              <Text style={{ fontSize: 12, lineHeight: 17, color: colors.faint, marginTop: spacing.md }}>
                Nothing there? Check your spam or junk folder before resending — that's where it lands most often.
              </Text>
            </Card>

            <PrimaryButton
              title={resendIn > 0 ? `Resend email (${resendIn}s)` : "Resend confirmation email"}
              onPress={resendConfirmationEmail}
              disabled={resendIn > 0}
              loading={loading}
              style={{ backgroundColor: colors.ink }}
            />

            <Pressable onPress={() => go("login")} style={{ marginTop: spacing.lg }}>
              <Text style={[onGradient, { textAlign: "center", fontWeight: "700" }]}>I've confirmed — sign in</Text>
            </Pressable>
            <Pressable onPress={() => go("signup")} style={{ marginTop: spacing.md }}>
              <Text style={[onGradientMuted, { textAlign: "center", fontSize: 12 }]}>
                Wrong address? Start over with a different one
              </Text>
            </Pressable>
          </>
        ) : mode === "mfaEnroll" ? (
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
                <Text style={[type.label, onGradientMuted, { marginBottom: spacing.sm }]}>
                  Which describes you? (required)
                </Text>
                {SELF_SERVICE_ACCOUNT_TYPES.map((opt) => {
                  const active = accountType === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => {
                        setAccountType(opt.id);
                        // Switching away from provider drops any org claim, so a
                        // consumer signup can't carry one along.
                        if (opt.id !== "provider") setOrgClaim(null);
                        // Clear the "choose one" complaint the moment it's answered.
                        if (!accountType) setError(null);
                      }}
                      style={{
                        // Thicker and tinted to match the error banner above, so
                        // the eye is drawn to the thing that needs answering.
                        borderWidth: accountTypeMissing ? 2 : 1,
                        borderColor: active
                          ? colors.primaryInk
                          : accountTypeMissing
                            ? colors.dangerSoft
                            : "rgba(255,255,255,0.45)",
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
                {accountType === "provider" ? (
                  <OrgPicker
                    value={orgClaim}
                    onChange={(next) => {
                      setOrgClaim(next);
                      setError(null);
                    }}
                    labelColor={fieldLabelColor}
                    onGradientMuted={onGradientMuted}
                  />
                ) : null}
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
                {signupAnswersMissing
                  ? "Answer the questions above first, then you can sign up with Google."
                  : accountType === "provider"
                    ? "Google keeps your answers above — no password needed."
                    : "No password needed."}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}
