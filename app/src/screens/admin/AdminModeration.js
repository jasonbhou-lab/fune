import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, Text, ActivityIndicator } from "react-native";
import { Card, Badge, SecondaryButton, SplitRow } from "../../components/ui";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

export default function AdminModeration({ token }) {
  const { showToast } = useAppState();
  const [offerings, setOfferings] = useState(null);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(() => {
    api.adminOfferings(token).then(setOfferings).catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (offering) => {
    const next = offering.status === "unpublished" ? "published" : "unpublished";
    setSavingId(offering.id);
    try {
      await api.adminSetOfferingStatus(token, offering.id, next);
      showToast(`${offering.name} is now ${next}.`);
      load();
    } catch (e) {
      showToast(`Couldn't update listing: ${e.message}`, "danger");
    } finally {
      setSavingId(null);
    }
  };

  if (error) return <Text style={{ color: colors.danger }}>{error}</Text>;
  if (!offerings) return <ActivityIndicator color={colors.primary} />;

  return (
    <ScrollView>
      <Text style={[type.h3, { marginBottom: spacing.md }]}>Listing moderation</Text>
      {offerings.map((o) => (
        <Card key={o.id} style={{ marginBottom: spacing.md }}>
          <SplitRow
            align="flex-start"
            left={
              <>
                <Text style={{ fontWeight: "700", marginBottom: 2 }}>{o.name}</Text>
                <Text style={type.caption}>
                  {o.providerName} · {o.locationName}
                </Text>
                <Text style={type.caption}>
                  {o.price.text} · disclosure {o.disclosure.complete}/{o.disclosure.total}
                </Text>
              </>
            }
            right={
              <Badge
                label={o.status}
                tone={o.status === "published" ? "ok" : o.status === "unpublished" ? "danger" : "warn"}
              />
            }
          />
          {(o.status === "published" || o.status === "unpublished") && (
            <SecondaryButton
              title={o.status === "unpublished" ? "Republish" : "Unpublish"}
              onPress={() => toggleStatus(o)}
              disabled={savingId === o.id}
              style={{ marginTop: spacing.sm }}
            />
          )}
        </Card>
      ))}
    </ScrollView>
  );
}
