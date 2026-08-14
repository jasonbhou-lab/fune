import React from "react";
import { View, Text } from "react-native";
import { Screen, SecondaryButton } from "../../components/ui";
import { colors, spacing, type } from "../../theme";

export default function ConfirmationScreen({ navigation, route }) {
  const { leadId, providerName } = route.params;
  return (
    <Screen style={{ alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.okSoft,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.md,
        }}
      >
        <Text style={{ fontSize: 26, color: colors.ok }}>✓</Text>
      </View>
      <Text style={[type.h2, { marginBottom: 8 }]}>Request sent</Text>
      <Text style={[type.caption, { textAlign: "center", marginBottom: 12, maxWidth: 280 }]}>
        {providerName} will contact you within 1 business day to confirm final pricing and availability.
      </Text>
      <Text style={[type.caption, { fontVariant: ["tabular-nums"], marginBottom: 4 }]}>Request #{leadId}</Text>
      <Text style={[type.caption, { marginBottom: spacing.xl }]}>This is not a booking. Nothing has been charged.</Text>
      <SecondaryButton
        title="View my requests"
        onPress={() => navigation.navigate("Main", { screen: "HistoryTab" })}
      />
    </Screen>
  );
}
