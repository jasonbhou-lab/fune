import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Screen, SecondaryButton, Card } from "../../components/ui";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

function Row({ label, onPress }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <Text style={{ fontSize: 14 }}>{label}</Text>
      <Text style={{ color: colors.faint }}>›</Text>
    </Pressable>
  );
}

export default function AccountScreen({ navigation }) {
  const { consumerUser, consumerLogout } = useAppState();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Text style={[type.h2, { marginBottom: 4 }]}>{consumerUser?.name}</Text>
      <Text style={[type.caption, { marginBottom: spacing.lg }]}>{consumerUser?.email}</Text>
      <Card>
        <Row label="Communication preferences" onPress={() => navigation.navigate("CommPrefs")} />
        <Row label="Sign out" onPress={consumerLogout} />
      </Card>

      <View style={{ flex: 1 }} />

      <Text style={[type.label, { marginBottom: spacing.sm }]}>For providers</Text>
      <SecondaryButton title="Provider portal sign in" onPress={() => navigation.navigate("PortalLogin")} />

      <Text style={[type.label, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>For platform staff</Text>
      <SecondaryButton title="Platform admin sign in" onPress={() => navigation.navigate("AdminLogin")} />
      </ScrollView>
    </Screen>
  );
}
