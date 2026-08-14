import React, { useEffect, useState } from "react";
import { ScrollView, Text, ActivityIndicator } from "react-native";
import { Card } from "../../components/ui";
import { api } from "../../api";
import { colors, spacing, type } from "../../theme";

export default function AdminAuditLog({ token }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.adminAuditLog(token).then(setEntries).catch((e) => setError(e.message));
  }, [token]);

  if (error) return <Text style={{ color: colors.danger }}>{error}</Text>;
  if (!entries) return <ActivityIndicator color={colors.primary} />;

  return (
    <ScrollView>
      <Text style={[type.h3, { marginBottom: spacing.md }]}>Audit log</Text>
      <Text style={[type.caption, { marginBottom: spacing.md }]}>Read-only. Every verification, listing, taxonomy, and report status change is recorded here.</Text>
      {entries.map((e) => (
        <Card key={e.id} style={{ marginBottom: spacing.sm }}>
          <Text style={{ fontWeight: "700" }}>{e.action.replace(/_/g, " ")}</Text>
          <Text style={type.caption}>
            {e.actor} · {e.entity}
          </Text>
          {(e.from || e.to) && (
            <Text style={type.caption}>
              {e.from ?? "—"} → {e.to ?? "—"}
            </Text>
          )}
          <Text style={type.caption}>{new Date(e.at).toLocaleString()}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}
