import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Screen, ScrollScreen, Banner, PrimaryButton, SecondaryButton } from "../../components/ui";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

// One comparison column. Equal share of the row, and allowed to shrink below its
// text's natural width so long provider names wrap rather than widening the row.
const CELL = { flex: 1, minWidth: 0 };

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
    <ScrollScreen wide contentStyle={{ flexGrow: 1 }}>
      <Text style={[type.h2, { marginBottom: spacing.md }]}>Comparing {data.rows.length} offer{data.rows.length === 1 ? "" : "s"}</Text>
      {/* Columns share the available width instead of being a fixed 150pt each.
          Four fixed columns plus gaps came to 648pt inside a 640pt reading
          column, which is what made this table scroll sideways. minWidth: 0 is
          required on web, where a flex child otherwise refuses to shrink below
          its content's intrinsic width and pushes the row wider instead. */}
      <View>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
          {data.rows.map((row) => (
            <View key={row.offeringId} style={CELL}>
              <Text style={{ fontWeight: "700", fontSize: 12 }}>{row.providerName}</Text>
              <Text style={{ fontSize: 15, fontWeight: "700" }}>{row.price.text}</Text>
              <Text style={type.caption}>{row.price.label}</Text>
              <Pressable onPress={() => removeFromCompare(row.offeringId)}>
                <Text style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <Text style={[type.label, { marginTop: spacing.sm }]}>Transfer & preparation</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
          {data.rows.map((row) => (
            <View key={row.offeringId} style={[CELL, { backgroundColor: colors.bgSunk, borderRadius: 8, padding: 8 }]}>
              <Text style={{ fontSize: 12, textAlign: "center" }}>{row.transferPreparation}</Text>
            </View>
          ))}
        </View>

        <Text style={type.label}>Cash advances / third-party</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
          {data.rows.map((row) => (
            <View
              key={row.offeringId}
              style={[
                CELL,
                {
                  borderRadius: 8,
                  padding: 8,
                  backgroundColor: row.thirdParty.state === "unknown" ? "transparent" : colors.bgSunk,
                  borderWidth: row.thirdParty.state === "unknown" ? 1 : 0,
                  borderColor: colors.line,
                  borderStyle: row.thirdParty.state === "unknown" ? "dashed" : "solid",
                },
              ]}
            >
              <Text style={{ fontSize: 12, textAlign: "center", color: row.thirdParty.state === "unknown" ? colors.faint : colors.ink }}>
                {row.thirdParty.text}
              </Text>
            </View>
          ))}
        </View>
      </View>

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
    </ScrollScreen>
  );
}
