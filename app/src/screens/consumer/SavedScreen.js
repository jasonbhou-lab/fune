import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, ScrollScreen, Card, Badge, SecondaryButton } from "../../components/ui";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

export default function SavedScreen({ navigation }) {
  const { consumerToken, consumerUser, showToast } = useAppState();
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [locationDetail, setLocationDetail] = useState(null);
  const [duplicatingId, setDuplicatingId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .saved(consumerToken)
      .then(setSaved)
      .finally(() => setLoading(false));
  }, [consumerToken]);

  useFocusEffect(load);

  const duplicateComparison = async (id) => {
    setDuplicatingId(id);
    try {
      await api.duplicateComparison(consumerToken, id);
      showToast("Comparison duplicated.");
      load();
    } catch (e) {
      showToast(`Couldn't duplicate: ${e.message}`, "danger");
    } finally {
      setDuplicatingId(null);
    }
  };

  const toggleExpand = async (locationId) => {
    if (expanded === locationId) {
      setExpanded(null);
      return;
    }
    setExpanded(locationId);
    const detail = await api.location(locationId);
    setLocationDetail(detail);
  };

  if (loading) {
    return (
      <Screen style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  return (
    <ScrollScreen>
      <Text style={[type.caption, { marginBottom: spacing.sm }]}>Signed in as {consumerUser?.name}</Text>
        <Text style={[type.label, { marginBottom: spacing.sm }]}>Saved providers</Text>
        {(saved?.providers || []).length === 0 ? (
          <Text style={[type.caption, { marginBottom: spacing.lg }]}>Nothing saved yet. Tap a provider's ♡ icon while browsing.</Text>
        ) : (
          saved.providers.map((p) => (
            <Card key={p.id} style={{ marginBottom: spacing.sm }}>
              <Pressable onPress={() => toggleExpand(p.id)}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontWeight: "700" }}>{p.orgName}</Text>
                  <Badge label={p.verified ? "Verified" : "Unverified"} tone={p.verified ? "ok" : "warn"} />
                </View>
                <Text style={type.caption}>{p.address}, {p.city}</Text>
              </Pressable>
              {expanded === p.id && locationDetail ? (
                <View style={{ marginTop: spacing.sm, gap: 6 }}>
                  {locationDetail.offerings.map((o) => (
                    <Pressable key={o.id} onPress={() => navigation.navigate("OfferDetail", { offeringId: o.id })}>
                      <Text style={{ color: colors.primary, fontSize: 13 }}>
                        {o.name} — {o.price.text}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Card>
          ))
        )}

        <Text style={[type.label, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>Saved comparisons</Text>
        {(saved?.comparisons || []).length === 0 ? (
          <Text style={type.caption}>No saved comparisons yet.</Text>
        ) : (
          saved.comparisons.map((c) => (
            <Card key={c.id} style={{ marginBottom: spacing.sm }}>
              <Pressable onPress={() => navigation.navigate("Compare", { ids: c.offeringIds })}>
                <Text style={{ fontWeight: "700" }}>{c.name}</Text>
                <Text style={type.caption}>Saved {new Date(c.createdAt).toLocaleDateString()}</Text>
              </Pressable>
              <SecondaryButton
                title="Duplicate"
                onPress={() => duplicateComparison(c.id)}
                disabled={duplicatingId === c.id}
                style={{ marginTop: spacing.sm, paddingVertical: 6 }}
              />
            </Card>
          ))
        )}
    </ScrollScreen>
  );
}
