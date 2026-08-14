import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, Text, ActivityIndicator } from "react-native";
import { Card, Badge, SecondaryButton } from "../../components/ui";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

const TONE = { open: "warn", resolved: "ok", dismissed: "danger" };

export default function AdminReports({ token }) {
  const { showToast } = useAppState();
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(() => {
    api.adminReports(token).then(setReports).catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (report, status) => {
    setSavingId(report.id);
    try {
      await api.adminSetReportStatus(token, report.id, status);
      showToast(`Report marked ${status}.`);
      load();
    } catch (e) {
      showToast(`Couldn't update report: ${e.message}`, "danger");
    } finally {
      setSavingId(null);
    }
  };

  if (error) return <Text style={{ color: colors.danger }}>{error}</Text>;
  if (!reports) return <ActivityIndicator color={colors.primary} />;

  return (
    <ScrollView>
      <Text style={[type.h3, { marginBottom: spacing.md }]}>Consumer pricing reports</Text>
      {reports.length === 0 && <Text style={type.caption}>No reports have been submitted.</Text>}
      {reports.map((r) => (
        <Card key={r.id} style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", marginBottom: 2 }}>{r.offeringName}</Text>
              <Text style={type.caption}>{r.providerName}</Text>
              <Text style={{ marginTop: 4 }}>{r.reason}</Text>
              {r.details ? <Text style={[type.caption, { marginTop: 2 }]}>{r.details}</Text> : null}
            </View>
            <Badge label={r.status} tone={TONE[r.status] || "warn"} />
          </View>
          {r.status === "open" && (
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              <SecondaryButton title="Mark resolved" onPress={() => setStatus(r, "resolved")} disabled={savingId === r.id} style={{ flex: 1 }} />
              <SecondaryButton title="Dismiss" onPress={() => setStatus(r, "dismissed")} disabled={savingId === r.id} style={{ flex: 1 }} />
            </View>
          )}
        </Card>
      ))}
    </ScrollView>
  );
}
