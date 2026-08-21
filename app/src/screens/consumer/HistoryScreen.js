import React, { useCallback, useState } from "react";
import { View, Text, FlatList, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card, Badge } from "../../components/ui";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";
import { useScrollLayout } from "../../responsive";

const STATUS_TONE = { new: "warn", contacted: "ok", quoted: "ok", appointment_scheduled: "ok", converted: "ok", closed_lost: "danger", do_not_contact: "danger" };

export default function HistoryScreen() {
  const { consumerToken } = useAppState();
  const layout = useScrollLayout({ padding: spacing.lg });
  const [leads, setLeads] = useState(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      api.myLeads(consumerToken).then(setLeads).finally(() => setLoading(false));
    }, [consumerToken])
  );

  if (loading) {
    return (
      <Screen style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  if (!leads || leads.length === 0) {
    return (
      <Screen style={{ alignItems: "center", justifyContent: "center" }}>
        <Text style={type.caption}>No requests sent yet.</Text>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={leads}
        keyExtractor={(l) => l.id}
        style={layout.scroller}
        contentContainerStyle={[layout.content, { gap: spacing.sm }]}
        renderItem={({ item }) => (
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "700" }}>{item.providerName}</Text>
              <Badge label={item.status.replace("_", " ")} tone={STATUS_TONE[item.status] || "ok"} />
            </View>
            <Text style={type.caption}>
              {item.offeringName || "General inquiry"} · sent {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </Card>
        )}
      />
    </View>
  );
}
