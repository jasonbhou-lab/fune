import React, { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { SvgXml } from "react-native-svg";
import { Screen, TextField, PrimaryButton, Banner } from "../../components/ui";
import { useAppState } from "../../context/AppState";
import { supabaseProvider } from "../../supabaseClient";
import { colors, spacing, type } from "../../theme";

export default function PortalLoginScreen({ navigation }) {
  const { providerLogin, providerVerifyMfa, providerCompleteMfaEnrollment, consumerToken } = useAppState();
  const [email, setEmail] = useState("jreyes@cedarhollow.example");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [challenge, setChallenge] = useState(null); // { factorId }
  const [enrollment, setEnrollment] = useState(null); // { factorId, qrSvg, secret }
  const [code, setCode] = useState("");

  const goHome = () => navigation.reset({ index: 0, routes: [{ name: consumerToken ? "Main" : "CreateAccount" }] });

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await providerLogin(email.trim(), password);
      if (result?.mfaRequired) {
        setChallenge({ factorId: result.factorId });
      } else if (result?.mfaEnrollmentRequired) {
        const { data, error: enrollError } = await supabaseProvider.auth.mfa.enroll({ factorType: "totp" });
        if (enrollError) throw new Error(enrollError.message);
        setEnrollment({ factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret });
      } else {
        navigation.replace("PortalHome");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const submitChallengeCode = async () => {
    setError(null);
    setLoading(true);
    try {
      await providerVerifyMfa(challenge.factorId, code.trim());
      navigation.replace("PortalHome");
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
      const { data: ch, error: challengeError } = await supabaseProvider.auth.mfa.challenge({ factorId: enrollment.factorId });
      if (challengeError) throw new Error(challengeError.message);
      const { error: verifyError } = await supabaseProvider.auth.mfa.verify({
        factorId: enrollment.factorId,
        challengeId: ch.id,
        code: code.trim(),
      });
      if (verifyError) throw new Error(verifyError.message);
      await providerCompleteMfaEnrollment();
      navigation.replace("PortalHome");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (enrollment) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: "100%", maxWidth: 360 }}>
            <Text style={[type.h2, { marginBottom: 4 }]}>Set up two-factor authentication</Text>
            <Text style={[type.caption, { marginBottom: spacing.lg }]}>
              This account's role requires it. Scan this code with an authenticator app (Google Authenticator, Authy, 1Password,
              etc.), then enter the 6-digit code it shows.
            </Text>
            {error ? <Banner tone="danger">{error}</Banner> : null}
            <View style={{ alignItems: "center", marginBottom: spacing.lg }}>
              <SvgXml xml={enrollment.qrSvg} width={180} height={180} />
              <Text style={[type.caption, { marginTop: spacing.sm, textAlign: "center" }]}>
                Can't scan it? Enter this key manually: {enrollment.secret}
              </Text>
            </View>
            <TextField label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" />
            <PrimaryButton title="Verify and finish setup" onPress={submitEnrollmentCode} loading={loading} />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (challenge) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: "100%", maxWidth: 360 }}>
            <Text style={[type.h2, { marginBottom: 4 }]}>Verify it's you</Text>
            <Text style={[type.caption, { marginBottom: spacing.lg }]}>Enter the 6-digit code from your authenticator app.</Text>
            {error ? <Banner tone="danger">{error}</Banner> : null}
            <TextField label="Verification code" value={code} onChangeText={setCode} keyboardType="number-pad" />
            <PrimaryButton title="Verify" onPress={submitChallengeCode} loading={loading} style={{ marginTop: spacing.sm }} />
            <Pressable onPress={() => setChallenge(null)} style={{ marginTop: spacing.lg }}>
              <Text style={{ color: colors.primary, textAlign: "center", fontWeight: "600" }}>← Back to sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: "100%", maxWidth: 360 }}>
          <Text style={[type.h2, { marginBottom: 4 }]}>Provider portal</Text>
          <Text style={[type.caption, { marginBottom: spacing.lg }]}>Sign in to manage your listings and leads.</Text>
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry />
          <PrimaryButton title="Sign in" onPress={submit} loading={loading} style={{ marginTop: spacing.sm }} />
          <Text style={[type.caption, { marginTop: spacing.md }]}>
            Demo accounts: jreyes@cedarhollow.example (no MFA) / dnguyen@riverbend.example (owner — sets up MFA on first
            sign-in) — password123
          </Text>
          <Pressable onPress={goHome} style={{ marginTop: spacing.lg }}>
            <Text style={{ color: colors.primary, textAlign: "center", fontWeight: "600" }}>← Back to the consumer app</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}
