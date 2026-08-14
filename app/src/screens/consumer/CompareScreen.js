import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Screen, Banner, PrimaryButton, SecondaryButton } from "../../components/ui";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

export default function CompareScreen({ navigation, route }) {
  const ids = route.params?.ids || [];
  const { removeFromCompare, consumerToken, showToast } = useAppState();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (ids.length === 0) return;
    api
      .compare(ids)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [ids.join(",")]);

  const saveComparison = async () => {
    try {
      await api.saveComparison(consumerToken, { name: `${data.rows.length} offers compared`, offeringIds: ids });
      showToast("Comparison saved to your account.");
    } catch (e) {
      showToast(`Couldn't save: ${e.message}`, "danger");
    }
  };

  if (ids.length === 0) {
    return (
      <Screen>
        <Text style={type.body}>Add offerings to compare from search results first.</Text>
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen>
        <Text style={{ color: colors.danger }}>{error}</Text>
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Text style={[type.h2, { marginBottom: spacing.md }]}>Comparing {data.rows.length} offer{data.rows.length === 1 ? "" : "s"}</Text>
      <ScrollView horizontal>
        <View>
          <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing.sm }}>
            {data.rows.map((row) => (
              <View key={row.offeringId} style={{ width: 150 }}>
                <Text numberOfLines={1} style={{ fontWeight: "700", fontSize: 12 }}>{row.providerName}</Text>
                <Text style={{ fontSize: 16, fontWeight: "700" }}>{row.price.text}</Text>
                <Text style={type.caption}>{row.price.label}</Text>
                <Pressable onPress={() => removeFromCompare(row.offeringId)}>
                  <Text style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <Text style={[type.label, { marginTop: spacing.sm }]}>Transfer & preparation</Text>
          <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing.sm }}>
            {data.rows.map((row) => (
              <View key={row.offeringId} style={{ width: 150, backgroundColor: colors.bgSunk, borderRadius: 8, padding: 8 }}>
                <Text style={{ fontSize: 12, textAlign: "center" }}>{row.transferPreparation}</Text>
              </View>
            ))}
          </View>

          <Text style={type.label}>Cash advances / third-party</Text>
          <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing.md }}>
            {data.rows.map((row) => (
              <View
                key={row.offeringId}
                style={{
                  width: 150,
                  borderRadius: 8,
                  padding: 8,
                  backgroundColor: row.thirdParty.state === "unknown" ? "transparent" : colors.bgSunk,
                  borderWidth: row.thirdParty.state === "unknown" ? 1 : 0,
                  borderColor: colors.line,
                  borderStyle: row.thirdParty.state === "unknown" ? "dashed" : "solid",
                }}
              >
                <Text style={{ fontSize: 12, textAlign: "center", color: row.thirdParty.state === "unknown" ? colors.faint : colors.ink }}>
                  {row.thirdParty.text}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {data.partialTotal ? <Banner tone="warn">Partial total only — {data.reason}</Banner> : null}

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
        <SecondaryButton title="Save comparison" onPress={saveComparison} style={{ flex: 1 }} />
        <PrimaryButton
          title="Request pricing"
          onPress={() => {
            const first = data.rows[0];
            navigation.navigate("LeadForm", { locationId: first.locationId, offeringId: first.offeringId, providerName: first.providerName });
          }}
          style={{ flex: 1 }}
        />
      </View>
      </ScrollView>
    </Screen>
  );
}
