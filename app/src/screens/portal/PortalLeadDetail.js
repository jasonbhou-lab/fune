import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Card, Chip, SplitRow } from "../../components/ui";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

const STATUSES = ["new", "contacted", "appointment_scheduled", "quoted", "converted", "closed_lost", "do_not_contact"];

export default function PortalLeadDetail({ token, leadId, onBack, onChanged }) {
  const { providerUser } = useAppState();
  const [lead, setLead] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.portalLead(token, leadId).then(setLead).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, [leadId]);

  const setStatus = async (status) => {
    setSaving(true);
    try {
      await api.portalUpdateLead(token, leadId, { status, owner: lead.owner || providerUser.id });
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (error) return <Text style={{ color: colors.danger }}>{error}</Text>;
  if (!lead) return <ActivityIndicator color={colors.primary} />;

  return (
    <ScrollView>
      <Pressable onPress={onBack} style={{ marginBottom: spacing.md }}>
        <Text style={{ color: colors.primary, fontWeight: "600" }}>← Back to leads</Text>
      </Pressable>

      <Text style={[type.h3, { marginBottom: 4 }]}>
        {lead.firstName} {lead.lastName} <Text style={type.caption}>· Request #{lead.id}</Text>
      </Text>

      <Text style={[type.label, { marginTop: spacing.md, marginBottom: 6 }]}>Status</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {STATUSES.map((s) => (
          <Chip key={s} label={s.replace(/_/g, " ")} active={lead.status === s} onPress={() => setStatus(s)} />
        ))}
      </View>
      {saving ? <Text style={type.caption}>Saving…</Text> : null}

      <Card style={{ marginTop: spacing.md }}>
        <Text style={type.label}>Requested offering</Text>
        <SplitRow
          style={{ marginTop: 4 }}
          align="flex-start"
          left={<Text style={{ fontWeight: "700" }}>{lead.offeringSnapshot?.name || "General inquiry"}</Text>}
          right={lead.offeringSnapshot?.amount ? <Text style={{ fontWeight: "700" }}>${lead.offeringSnapshot.amount}</Text> : null}
        />
        <Text style={type.caption}>Snapshot captured at submission — not linked to current catalog</Text>
      </Card>

      {lead.message ? (
        <Card style={{ marginTop: spacing.sm }}>
          <Text style={type.label}>Message</Text>
          <Text style={{ marginTop: 4 }}>"{lead.message}"</Text>
        </Card>
      ) : null}

      <Card style={{ marginTop: spacing.sm }}>
        <Text style={type.label}>Contact</Text>
        <Text style={{ marginTop: 4 }}>Preferred method: {lead.contactMethod}</Text>
        <Text>Phone: {lead.phone || "—"}</Text>
        <Text>Email: {lead.email || "—"}</Text>
        <Text>Need type: {lead.needType?.replace("_", " ")}</Text>
      </Card>

      <Card style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}>
        <Text style={type.label}>Consent record</Text>
        <Text style={{ marginTop: 4 }}>Consent to contact: {lead.consentToContact ? `Granted · ${lead.consentVersion}` : "Not granted"}</Text>
        <Text>Marketing opt-in: {lead.marketingOptIn ? "Granted" : "Declined"}</Text>
        <Text>Timestamp: {new Date(lead.consentTimestamp).toLocaleString()}</Text>
      </Card>

      <Text style={[type.label, { marginBottom: 6 }]}>Timeline</Text>
      {lead.statusHistory.map((h, i) => (
        <Text key={i} style={{ marginBottom: 4 }}>
          <Text style={{ fontWeight: "700" }}>{h.status.replace(/_/g, " ")}</Text> — {new Date(h.at).toLocaleString()}
        </Text>
      ))}
    </ScrollView>
  );
}
