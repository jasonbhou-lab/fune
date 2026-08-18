import React, { useEffect, useState } from "react";
import { View, ScrollView, Text, ActivityIndicator } from "react-native";
import { Card, SplitRow } from "../../components/ui";
import { api } from "../../api";
import { colors, spacing, type } from "../../theme";

const LABELS = { search: "Searches", offer_view: "Offer views", comparison_view: "Comparisons viewed", lead_submitted: "Leads submitted" };

export default function AdminAnalytics({ token }) {
  const [funnel, setFunnel] = useState(null);
  const [topCategories, setTopCategories] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.adminFunnel(token), api.adminTopCategories(token)])
      .then(([f, t]) => {
        setFunnel(f);
        setTopCategories(t);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  if (error) return <Text style={{ color: colors.danger }}>{error}</Text>;
  if (!funnel || !topCategories) return <ActivityIndicator color={colors.primary} />;

  return (
    <ScrollView>
      <Text style={[type.h3, { marginBottom: spacing.md }]}>Analytics</Text>

      <Card style={{ marginBottom: spacing.md }}>
        <Text style={[type.label, { marginBottom: spacing.sm }]}>Funnel — last 30 days</Text>
        {Object.keys(LABELS).map((key) => (
          <SplitRow
            key={key}
            style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line }}
            left={<Text>{LABELS[key]}</Text>}
            right={<Text style={{ fontWeight: "700" }}>{funnel.last30Days[key]}</Text>}
          />
        ))}
        <Text style={[type.caption, { marginTop: spacing.sm }]}>All-time totals: {Object.keys(LABELS).map((k) => `${LABELS[k]} ${funnel.allTime[k]}`).join(" · ")}</Text>
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <Text style={[type.label, { marginBottom: spacing.sm }]}>Top searched categories — last {topCategories.windowDays} days</Text>
        {topCategories.categories.length === 0 && <Text style={type.caption}>No search activity yet.</Text>}
        {topCategories.categories.map((c) => (
          <SplitRow
            key={c.key}
            style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line }}
            left={<Text>{c.key}</Text>}
            right={<Text style={{ fontWeight: "700" }}>{c.count}</Text>}
          />
        ))}
      </Card>

      <Card style={{ marginBottom: spacing.xl }}>
        <Text style={[type.label, { marginBottom: spacing.sm }]}>Top searched geographies — last {topCategories.windowDays} days</Text>
        {topCategories.zips.length === 0 && <Text style={type.caption}>No search activity yet.</Text>}
        {topCategories.zips.map((z) => (
          <SplitRow
            key={z.key}
            style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line }}
            left={<Text>{z.key}</Text>}
            right={<Text style={{ fontWeight: "700" }}>{z.count}</Text>}
          />
        ))}
      </Card>
    </ScrollView>
  );
}
