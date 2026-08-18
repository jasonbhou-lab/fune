import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { Card, Banner, SplitRow } from "../../components/ui";
import { api } from "../../api";
import { colors, spacing, type } from "../../theme";

export default function PortalDashboard({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.portalDashboard(token).then(setData).catch((e) => setError(e.message));
  }, [token]);

  if (error) return <Text style={{ color: colors.danger }}>{error}</Text>;
  if (!data) return <ActivityIndicator color={colors.primary} />;

  return (
    <ScrollView>
      <Text style={[type.h2, { marginBottom: spacing.md }]}>Welcome back, {data.orgName}</Text>

      {data.incompleteOfferingName ? (
        <Banner tone="warn">
          Your catalog is {data.catalogCompletenessPct}% complete — "{data.incompleteOfferingName}" is missing a disclosure.
        </Banner>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.lg, flexWrap: "wrap" }}>
        <Card style={{ flex: 1, minWidth: 140 }}>
          <Text style={{ fontSize: 22, fontWeight: "700" }}>{data.leadsThisWeek}</Text>
          <Text style={type.caption}>Leads this week</Text>
        </Card>
        <Card style={{ flex: 1, minWidth: 140 }}>
          <Text style={{ fontSize: 22, fontWeight: "700" }}>{data.medianResponseHours != null ? `${data.medianResponseHours} hrs` : "—"}</Text>
          <Text style={type.caption}>Median first response</Text>
        </Card>
        <Card style={{ flex: 1, minWidth: 140 }}>
          <Text style={{ fontSize: 22, fontWeight: "700" }}>{data.offeringsReviewed}</Text>
          <Text style={type.caption}>Offerings reviewed &lt;90 days</Text>
        </Card>
      </View>

      <Text style={[type.label, { marginBottom: spacing.sm }]}>Recent activity</Text>
      {data.activity.map((a, i) => (
        <SplitRow
          key={i}
          style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}
          left={<Text style={{ fontSize: 13 }}>{a.label}</Text>}
          right={<Text style={type.caption}>{new Date(a.at).toLocaleDateString()}</Text>}
        />
      ))}
    </ScrollView>
  );
}
