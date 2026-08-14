import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, ScrollView, ActivityIndicator } from "react-native";
import { Card, Badge, Chip } from "../../components/ui";
import { api } from "../../api";
import { colors, spacing, type } from "../../theme";

const STATUS_TONE = {
  new: "warn",
  contacted: "ok",
  appointment_scheduled: "ok",
  quoted: "ok",
  converted: "ok",
  closed_lost: "danger",
  do_not_contact: "danger",
};

const STATUS_OPTIONS = [
  { id: null, label: "All statuses" },
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "appointment_scheduled", label: "Appointment" },
  { id: "quoted", label: "Quoted" },
  { id: "converted", label: "Converted" },
  { id: "closed_lost", label: "Closed lost" },
  { id: "do_not_contact", label: "Do not contact" },
];

const NEED_OPTIONS = [
  { id: null, label: "All needs" },
  { id: "immediate_need", label: "Immediate need" },
  { id: "planning_ahead", label: "Planning ahead" },
  { id: "research", label: "Research" },
];

export default function PortalLeads({ token, onSelect, refreshKey }) {
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [needType, setNeedType] = useState(null);

  const load = useCallback(() => {
    const params = {};
    if (status) params.status = status;
    if (needType) params.needType = needType;
    api.portalLeads(token, Object.keys(params).length ? params : undefined).then(setLeads).catch((e) => setError(e.message));
  }, [token, status, needType]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (error) return <Text style={{ color: colors.danger }}>{error}</Text>;

  return (
    <View style={{ flex: 1 }}>
      <Text style={[type.h3, { marginBottom: spacing.sm }]}>Leads</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4, flexGrow: 0, flexShrink: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {STATUS_OPTIONS.map((opt) => (
            <Chip key={opt.label} label={opt.label} active={status === opt.id} onPress={() => setStatus(opt.id)} />
          ))}
        </View>
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md, flexGrow: 0, flexShrink: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {NEED_OPTIONS.map((opt) => (
            <Chip key={opt.label} label={opt.label} active={needType === opt.id} onPress={() => setNeedType(opt.id)} />
          ))}
        </View>
      </ScrollView>

      {!leads ? (
        <ActivityIndicator color={colors.primary} />
      ) : leads.length === 0 ? (
        <Text style={type.caption}>No leads match these filters.</Text>
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ gap: spacing.sm }}
          renderItem={({ item }) => (
            <Pressable onPress={() => onSelect(item.id)}>
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontWeight: "700" }}>{item.firstName} {item.lastName}</Text>
                  <Badge label={item.status} tone={STATUS_TONE[item.status] || "ok"} />
                </View>
                <Text style={type.caption}>
                  {item.offeringName} · {item.needType?.replace("_", " ")} · {new Date(item.createdAt).toLocaleString()}
                </Text>
                <Text style={type.caption}>Owner: {item.owner || "Unassigned"}</Text>
              </Card>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
