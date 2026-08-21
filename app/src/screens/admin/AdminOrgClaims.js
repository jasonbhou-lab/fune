import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, Text, Pressable, ActivityIndicator } from "react-native";
import { Card, Badge, SecondaryButton, SplitRow, Banner } from "../../components/ui";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

const PROVIDER_ROLES = [
  { id: "lead_manager", label: "Lead manager" },
  { id: "administrator", label: "Administrator" },
  { id: "owner", label: "Owner" },
];

/**
 * Provider accounts asking to be attached to an organization.
 *
 * This is the gate on the only self-service route into an organization's data.
 * Approving one lets that person read the organization's enquiries, which carry
 * bereaved families' names, phone numbers and circumstances, so the screen is
 * deliberately blunt about what approval means and does not offer a bulk action.
 */
export default function AdminOrgClaims({ token }) {
  const { showToast } = useAppState();
  const [claims, setClaims] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  // Chosen provider role per claim, before approving.
  const [roles, setRoles] = useState({});

  const load = useCallback(() => {
    setError(null);
    api
      .adminOrgClaims(token)
      .then(setClaims)
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const roleFor = (claim) => roles[claim.id] || (claim.isNewOrg ? "owner" : "lead_manager");

  const approve = async (claim) => {
    setBusyId(claim.id);
    try {
      await api.adminApproveOrgClaim(token, claim.id, roleFor(claim));
      showToast(`${claim.name} connected as ${roleFor(claim).replace("_", " ")}.`);
      load();
    } catch (e) {
      showToast(`Couldn't approve: ${e.message}`, "danger");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (claim) => {
    setBusyId(claim.id);
    try {
      await api.adminRejectOrgClaim(token, claim.id);
      showToast(`Request from ${claim.name} declined.`);
      load();
    } catch (e) {
      showToast(`Couldn't decline: ${e.message}`, "danger");
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <Text style={{ color: colors.danger }}>{error}</Text>;
  if (!claims) return <ActivityIndicator color={colors.primary} />;

  return (
    <ScrollView>
      <Text style={[type.h3, { marginBottom: spacing.sm }]}>Organization requests</Text>
      <Banner tone="warn">
        Approving connects this person to the organization's listings and enquiries, including families' contact details.
        Confirm they actually work there before approving — the request is only what they typed.
      </Banner>

      {claims.length === 0 ? (
        <Text style={[type.caption, { marginTop: spacing.md }]}>No requests are waiting.</Text>
      ) : null}

      {claims.map((claim) => {
        const busy = busyId === claim.id;
        const selectedRole = roleFor(claim);
        return (
          <Card key={claim.id} style={{ marginTop: spacing.md }}>
            <SplitRow
              align="flex-start"
              left={
                <>
                  <Text style={{ fontWeight: "700", marginBottom: 2 }}>{claim.name}</Text>
                  <Text style={type.caption}>{claim.email}</Text>
                </>
              }
              right={<Badge label={claim.isNewOrg ? "New organization" : "Existing"} tone={claim.isNewOrg ? "warn" : "ok"} />}
            />

            <View style={{ marginTop: spacing.md }}>
              <Text style={type.label}>Requesting</Text>
              <Text style={{ fontWeight: "600", marginTop: 2 }}>
                {claim.isNewOrg ? claim.requestedOrgName : claim.claimedOrg?.name || "(organization no longer exists)"}
              </Text>
              {claim.isNewOrg ? (
                <Text style={[type.caption, { marginTop: 2 }]}>
                  Not on the platform yet. Approving creates it, unverified — verify it separately on Organizations.
                </Text>
              ) : claim.claimedOrg && !claim.claimedOrg.verified ? (
                <Text style={[type.caption, { marginTop: 2 }]}>This organization is not verified.</Text>
              ) : null}
            </View>

            <View style={{ marginTop: spacing.md }}>
              <Text style={type.label}>Connect as</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
                {PROVIDER_ROLES.map((r) => {
                  const active = selectedRole === r.id;
                  return (
                    <Pressable
                      key={r.id}
                      onPress={() => setRoles((prev) => ({ ...prev, [claim.id]: r.id }))}
                      style={{
                        borderWidth: 1,
                        borderColor: active ? colors.primary : colors.line,
                        backgroundColor: active ? colors.accentSoft : "transparent",
                        borderRadius: 999,
                        paddingVertical: 6,
                        paddingHorizontal: 12,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: active ? "700" : "500", color: active ? colors.ink : colors.muted }}>
                        {r.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
              <SecondaryButton title={busy ? "Working…" : "Approve"} onPress={() => approve(claim)} disabled={busy} />
              <SecondaryButton title="Decline" onPress={() => reject(claim)} disabled={busy} />
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}
