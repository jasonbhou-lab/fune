import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Card, Badge, Banner, SplitRow, SecondaryButton } from "../../components/ui";
import { api } from "../../api";
import { colors, spacing, type } from "../../theme";
import PortalDashboard from "../portal/PortalDashboard";
import PortalLocations from "../portal/PortalLocations";
import PortalCatalog from "../portal/PortalCatalog";
import PortalCatalogEditor from "../portal/PortalCatalogEditor";
import PortalLeads from "../portal/PortalLeads";
import PortalLeadDetail from "../portal/PortalLeadDetail";
import PortalReviews from "../portal/PortalReviews";

const VIEWS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "locations", label: "Locations" },
  { id: "catalog", label: "Catalog" },
  { id: "leads", label: "Enquiries" },
  { id: "reviews", label: "Reviews" },
];

/**
 * The provider portal, driven by a platform admin against a chosen organization.
 *
 * These are the same components a provider sees, not copies: they take an
 * actAsOrg prop that becomes a header the backend honours only for a
 * platform_admin. Reimplementing them would have meant maintaining two versions
 * of the catalog editor and the lead workflow, which is how the two drift apart.
 *
 * The banner is not decoration. Enquiries carry a bereaved family's name, phone
 * number and circumstances, and it should be obvious at a glance that this is
 * someone else's data and that every change is recorded against your name.
 */
export default function AdminOperate({ token }) {
  const [orgs, setOrgs] = useState(null);
  const [error, setError] = useState(null);
  const [org, setOrg] = useState(null);
  const [view, setView] = useState("dashboard");
  const [editingOffering, setEditingOffering] = useState(undefined);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [primaryLocationId, setPrimaryLocationId] = useState(null);

  useEffect(() => {
    api
      .adminOrgs(token)
      .then(setOrgs)
      .catch((e) => setError(e.message));
  }, [token]);

  // The catalog editor needs a location to attach a new offering to, the same
  // way PortalHomeScreen resolves one for a provider.
  const loadPrimaryLocation = useCallback(
    async (orgId) => {
      try {
        const locations = await api.portalLocations(token, orgId);
        setPrimaryLocationId(locations?.[0]?.id || null);
      } catch {
        setPrimaryLocationId(null);
      }
    },
    [token]
  );

  const choose = (next) => {
    setOrg(next);
    setView("dashboard");
    setEditingOffering(undefined);
    setSelectedLeadId(null);
    setPrimaryLocationId(null);
    if (next) loadPrimaryLocation(next.id);
  };

  if (error) return <Text style={{ color: colors.danger }}>{error}</Text>;
  if (!orgs) return <ActivityIndicator color={colors.primary} />;

  if (!org) {
    return (
      <ScrollView>
        <Text style={[type.h3, { marginBottom: spacing.sm }]}>Work inside a provider's portal</Text>
        <Text style={[type.caption, { marginBottom: spacing.md, lineHeight: 18 }]}>
          Pick an organization to manage its locations, listings, enquiries and review replies exactly as its own staff
          would. Everything you change is recorded against your name in the audit log.
        </Text>
        {orgs.length === 0 ? <Text style={type.caption}>No organizations yet.</Text> : null}
        {orgs.map((o) => (
          <Card key={o.id} style={{ marginBottom: spacing.sm }}>
            <SplitRow
              align="flex-start"
              left={
                <>
                  <Text style={{ fontWeight: "700", marginBottom: 2 }}>{o.name}</Text>
                  <Text style={type.caption}>
                    {o.locationCount} location{o.locationCount === 1 ? "" : "s"} · {o.userCount} user
                    {o.userCount === 1 ? "" : "s"}
                  </Text>
                </>
              }
              right={<Badge label={o.verified ? "Verified" : "Unverified"} tone={o.verified ? "ok" : "warn"} />}
            />
            <SecondaryButton title="Open portal" onPress={() => choose(o)} style={{ marginTop: spacing.md }} />
          </Card>
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Banner tone="warn">
        Working inside {org.name} as a platform admin. This is that organization's live data, including families'
        contact details, and every change is attributed to you.
      </Banner>

      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.md }}>
        <Pressable onPress={() => choose(null)}>
          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>← All organizations</Text>
        </Pressable>
        {VIEWS.map((v) => (
          <Pressable
            key={v.id}
            onPress={() => {
              setView(v.id);
              setEditingOffering(undefined);
              setSelectedLeadId(null);
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: view === v.id ? colors.primary : colors.muted,
                fontWeight: view === v.id ? "700" : "500",
              }}
            >
              {v.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {view === "dashboard" && <PortalDashboard token={token} actAsOrg={org.id} />}

      {view === "locations" && <PortalLocations token={token} actAsOrg={org.id} />}

      {view === "reviews" && <PortalReviews token={token} actAsOrg={org.id} />}

      {view === "catalog" && editingOffering === undefined && (
        <PortalCatalog
          token={token}
          actAsOrg={org.id}
          refreshKey={refreshKey}
          onSelect={(o) => setEditingOffering(o)}
          onCreateNew={() => setEditingOffering(null)}
        />
      )}
      {view === "catalog" && editingOffering !== undefined && (
        <PortalCatalogEditor
          token={token}
          actAsOrg={org.id}
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
        <PortalLeads token={token} actAsOrg={org.id} refreshKey={refreshKey} onSelect={setSelectedLeadId} />
      )}
      {view === "leads" && selectedLeadId && (
        <PortalLeadDetail
          token={token}
          actAsOrg={org.id}
          leadId={selectedLeadId}
          onBack={() => setSelectedLeadId(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </View>
  );
}
