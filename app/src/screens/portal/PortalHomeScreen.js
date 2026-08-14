import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { useAppState } from "../../context/AppState";
import { api } from "../../api";
import { colors, spacing } from "../../theme";
import PortalDashboard from "./PortalDashboard";
import PortalCatalog from "./PortalCatalog";
import PortalCatalogEditor from "./PortalCatalogEditor";
import PortalLeads from "./PortalLeads";
import PortalLeadDetail from "./PortalLeadDetail";
import PortalLocations from "./PortalLocations";

const NAV = [
  { id: "dashboard", label: "Dashboard" },
  { id: "locations", label: "Locations" },
  { id: "catalog", label: "Catalog" },
  { id: "leads", label: "Leads" },
];

export default function PortalHomeScreen({ navigation }) {
  const { providerUser, providerToken, providerLogout, consumerToken } = useAppState();
  const [view, setView] = useState("dashboard");
  const [editingOffering, setEditingOffering] = useState(undefined); // undefined = list, null = new, object = edit
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [primaryLocationId, setPrimaryLocationId] = useState(null);

  useEffect(() => {
    if (!providerToken) return;
    api
      .portalLocations(providerToken)
      .then((locs) => setPrimaryLocationId(locs[0]?.id || null))
      .catch(() => {});
  }, [providerToken]);

  const goto = (v) => {
    setView(v);
    setEditingOffering(undefined);
    setSelectedLeadId(null);
  };

  const signOut = async () => {
    await providerLogout();
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
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
          <Text style={{ fontWeight: "700" }}>{providerUser?.orgName}</Text>
          {NAV.map((n) => (
            <Pressable key={n.id} onPress={() => goto(n.id)}>
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

      <View
        style={[
          { flex: 1, width: "100%", padding: spacing.lg },
          Platform.OS === "web" && { maxWidth: "50%", alignSelf: "center" },
        ]}
      >
        {view === "dashboard" && <PortalDashboard token={providerToken} />}

        {view === "locations" && <PortalLocations token={providerToken} />}

        {view === "catalog" && editingOffering === undefined && (
          <PortalCatalog
            token={providerToken}
            refreshKey={refreshKey}
            onSelect={(o) => setEditingOffering(o)}
            onCreateNew={() => setEditingOffering(null)}
          />
        )}
        {view === "catalog" && editingOffering !== undefined && (
          <PortalCatalogEditor
            token={providerToken}
            offering={editingOffering}
            locationId={editingOffering?.locationId || primaryLocationId}
            onCancel={() => setEditingOffering(undefined)}
            onDone={() => {
              setEditingOffering(undefined);
              setRefreshKey((k) => k + 1);
            }}
          />
        )}

        {view === "leads" && !selectedLeadId && (
          <PortalLeads token={providerToken} refreshKey={refreshKey} onSelect={setSelectedLeadId} />
        )}
        {view === "leads" && selectedLeadId && (
          <PortalLeadDetail
            token={providerToken}
            leadId={selectedLeadId}
            onBack={() => setSelectedLeadId(null)}
            onChanged={() => setRefreshKey((k) => k + 1)}
          />
        )}
      </View>
    </View>
  );
}
