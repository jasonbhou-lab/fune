import React, { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useAppState } from "../../context/AppState";
import { api } from "../../api";
import { colors, spacing, type } from "../../theme";
import { useContentWidth } from "../../responsive";
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
  const { providerUser, providerToken, providerLogout } = useAppState();
  const contentWidth = useContentWidth();
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

  // No explicit navigation: clearing the session makes RootNavigator fall back
  // to the sign-in gate on its own.
  const signOut = () => providerLogout();

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
          // The org name, four nav items, and Sign out need more than a phone's
          // width. Without wrapping they squash and the labels break mid-word.
          // Wrapping is inert on a wide screen, where the row still fits on one
          // line. Matches AdminHomeScreen's nav bar.
          flexWrap: "wrap",
          rowGap: spacing.sm,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg, flexWrap: "wrap", rowGap: spacing.sm }}>
          <Text style={{ fontWeight: "700" }}>{providerUser?.orgName || "Provider portal"}</Text>
          {(providerUser?.orgId ? NAV : []).map((n) => (
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
          contentWidth,
        ]}
      >
        {/* A provider who signed themselves up has no org_id until an admin
            attaches them to one. Every portal query is scoped by organization,
            so without this they would see an empty dashboard, an empty catalog
            and no leads, with nothing explaining why. */}
        {!providerUser?.orgId ? (
          <>
            <Text style={[type.h3, { marginBottom: spacing.sm }]}>
              {providerUser?.orgClaimStatus === "pending"
                ? "Waiting for approval"
                : providerUser?.orgClaimStatus === "rejected"
                  ? "Request declined"
                  : "Account pending setup"}
            </Text>
            <Text style={{ color: colors.muted, lineHeight: 20 }}>
              {providerUser?.orgClaimStatus === "pending" ? (
                <>
                  You asked to join{" "}
                  <Text style={{ fontWeight: "700", color: colors.ink }}>
                    {providerUser.orgName || providerUser.requestedOrgName || "an organization"}
                  </Text>
                  . A platform administrator has to confirm you work there before your account is connected, because the
                  portal shows families' enquiries and contact details. You'll get access as soon as it's approved.
                </>
              ) : providerUser?.orgClaimStatus === "rejected" ? (
                "Your request to join an organization wasn't approved. If you believe that's a mistake, contact us and we'll take another look."
              ) : (
                "Your provider account isn't linked to an organization yet, so there are no locations, listings, or leads to show. A platform administrator needs to connect it to your funeral home before the portal becomes useful."
              )}
            </Text>
            <Text style={[type.caption, { marginTop: spacing.md }]}>
              Signed in as {providerUser?.email || "this account"}.
            </Text>
          </>
        ) : (
          <>
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
          </>
        )}
      </View>
    </View>
  );
}
