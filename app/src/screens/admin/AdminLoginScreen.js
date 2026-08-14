import React, { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Screen, TextField, PrimaryButton, Banner } from "../../components/ui";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

export default function AdminLoginScreen({ navigation }) {
  const { adminLogin, consumerToken } = useAppState();
  const goHome = () => navigation.reset({ index: 0, routes: [{ name: consumerToken ? "Main" : "CreateAccount" }] });
  const [email, setEmail] = useState("admin@funeralpricecompare.example");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await adminLogin(email.trim(), password);
      navigation.replace("AdminHome");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: "100%", maxWidth: 360 }}>
          <Text style={[type.h2, { marginBottom: 4 }]}>Platform admin</Text>
          <Text style={[type.caption, { marginBottom: spacing.lg }]}>Internal back office. Not for provider or consumer accounts.</Text>
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry />
          <PrimaryButton title="Sign in" onPress={submit} loading={loading} style={{ marginTop: spacing.sm }} />
          <Text style={[type.caption, { marginTop: spacing.md }]}>Demo account: admin@funeralpricecompare.example — admin123</Text>
          <Pressable onPress={goHome} style={{ marginTop: spacing.lg }}>
            <Text style={{ color: colors.primary, textAlign: "center", fontWeight: "600" }}>← Back to the consumer app</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}
