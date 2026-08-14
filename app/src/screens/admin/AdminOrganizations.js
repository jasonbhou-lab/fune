import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, Text, ActivityIndicator } from "react-native";
import { Card, Badge, SecondaryButton } from "../../components/ui";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

export default function AdminOrganizations({ token }) {
  const { showToast } = useAppState();
  const [orgs, setOrgs] = useState(null);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(() => {
    api.adminOrgs(token).then(setOrgs).catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleVerified = async (org) => {
    setSavingId(org.id);
    try {
      await api.adminSetVerified(token, org.id, !org.verified);
      showToast(`${org.name} is now ${!org.verified ? "verified" : "unverified"}.`);
      load();
    } catch (e) {
      showToast(`Couldn't update verification: ${e.message}`, "danger");
    } finally {
      setSavingId(null);
    }
  };

  if (error) return <Text style={{ color: colors.danger }}>{error}</Text>;
  if (!orgs) return <ActivityIndicator color={colors.primary} />;

  return (
    <ScrollView>
      <Text style={[type.h3, { marginBottom: spacing.md }]}>Organizations</Text>
      {orgs.map((org) => (
        <Card key={org.id} style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", marginBottom: 4 }}>{org.name}</Text>
              <Text style={type.caption}>
                {org.locationCount} location{org.locationCount === 1 ? "" : "s"} · {org.userCount} user{org.userCount === 1 ? "" : "s"}
              </Text>
            </View>
            <Badge label={org.verified ? "Verified" : "Unverified"} tone={org.verified ? "ok" : "warn"} />
          </View>
          <SecondaryButton
            title={org.verified ? "Revoke verification" : "Mark verified"}
            onPress={() => toggleVerified(org)}
            disabled={savingId === org.id}
            style={{ marginTop: spacing.sm }}
          />
        </Card>
      ))}
    </ScrollView>
  );
}
