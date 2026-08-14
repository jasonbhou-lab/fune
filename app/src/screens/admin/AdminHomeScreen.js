import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useAppState } from "../../context/AppState";
import { colors, spacing } from "../../theme";
import AdminOrganizations from "./AdminOrganizations";
import AdminModeration from "./AdminModeration";
import AdminTaxonomy from "./AdminTaxonomy";
import AdminReports from "./AdminReports";
import AdminAuditLog from "./AdminAuditLog";
import AdminAnalytics from "./AdminAnalytics";

const NAV = [
  { id: "orgs", label: "Organizations" },
  { id: "moderation", label: "Moderation" },
  { id: "taxonomy", label: "Taxonomy" },
  { id: "reports", label: "Reports" },
  { id: "audit", label: "Audit log" },
  { id: "analytics", label: "Analytics" },
];

export default function AdminHomeScreen({ navigation }) {
  const { adminUser, adminToken, adminLogout, consumerToken } = useAppState();
  const [view, setView] = useState("orgs");

  const signOut = async () => {
    await adminLogout();
    navigation.reset({ index: 0, routes: [{ name: consumerToken ? "Main" : "CreateAccount" }] });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: spacing.lg,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
          backgroundColor: colors.bgCard,
          flexWrap: "wrap",
          rowGap: spacing.sm,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg, flexWrap: "wrap", rowGap: spacing.sm }}>
          <Text style={{ fontWeight: "700" }}>Platform admin — {adminUser?.name}</Text>
          {NAV.map((n) => (
            <Pressable key={n.id} onPress={() => setView(n.id)}>
              <Text style={{ color: view === n.id ? colors.primary : colors.muted, fontWeight: view === n.id ? "700" : "500" }}>
                {n.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={signOut}>
          <Text style={{ color: colors.danger }}>Sign out</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, padding: spacing.lg }}>
        {view === "orgs" && <AdminOrganizations token={adminToken} />}
        {view === "moderation" && <AdminModeration token={adminToken} />}
        {view === "taxonomy" && <AdminTaxonomy token={adminToken} />}
        {view === "reports" && <AdminReports token={adminToken} />}
        {view === "audit" && <AdminAuditLog token={adminToken} />}
        {view === "analytics" && <AdminAnalytics token={adminToken} />}
      </View>
    </View>
  );
}
