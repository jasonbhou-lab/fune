import React, { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Screen } from "../../components/ui";
import { supabaseConsumer } from "../../supabaseClient";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

const COLUMN_MAP = {
  requestUpdates: "request_updates",
  planningResources: "planning_resources",
  providerOffers: "provider_offers",
  doNotContact: "do_not_contact",
};

function Toggle({ value, onChange }) {
  return (
    <Pressable
      onPress={onChange}
      style={{
        width: 44,
        height: 26,
        borderRadius: 14,
        backgroundColor: value ? colors.primary : colors.bgSunk,
        borderWidth: 1,
        borderColor: value ? colors.primary : colors.line,
        padding: 2,
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: value ? colors.primaryInk : colors.faint,
          alignSelf: value ? "flex-end" : "flex-start",
        }}
      />
    </Pressable>
  );
}

export default function CommPrefsScreen() {
  const { consumerUser, showToast } = useAppState();
  const [prefs, setPrefs] = useState({
    requestUpdates: consumerUser?.requestUpdates ?? true,
    planningResources: consumerUser?.planningResources ?? false,
    providerOffers: consumerUser?.providerOffers ?? false,
  });

  const update = async (key, value) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    const { error } = await supabaseConsumer.from("profiles").update({ [COLUMN_MAP[key]]: value }).eq("id", consumerUser.id);
    if (error) showToast(`Couldn't save: ${error.message}`, "danger");
  };

  const rows = [
    { key: "requestUpdates", label: "Updates on my requests", sub: "Email & text, required", locked: true },
    { key: "planningResources", label: "Planning resources & tips", sub: "Occasional, optional" },
    { key: "providerOffers", label: "Offers from providers", sub: "Optional" },
  ];

  return (
    <Screen>
      <ScrollView>
      {rows.map((r) => (
        <View key={r.key} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <View style={{ flex: 1, marginRight: spacing.md }}>
            <Text style={{ fontSize: 14, fontWeight: "600" }}>{r.label}</Text>
            <Text style={type.caption}>{r.sub}</Text>
          </View>
          <Toggle value={r.locked ? true : prefs[r.key]} onChange={() => !r.locked && update(r.key, !prefs[r.key])} />
        </View>
      ))}
      <Pressable onPress={() => update("doNotContact", true)} style={{ paddingTop: spacing.lg }}>
        <Text style={{ color: colors.danger, fontWeight: "700" }}>Do not contact me</Text>
      </Pressable>
      </ScrollView>
    </Screen>
  );
}
