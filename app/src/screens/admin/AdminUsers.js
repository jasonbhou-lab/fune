import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Card, Badge, Banner, SplitRow, TextField, SecondaryButton } from "../../components/ui";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

const ROLES = [
  { id: "consumer", label: "Consumer" },
  { id: "provider", label: "Provider" },
  { id: "platform_admin", label: "Platform admin" },
];

const PROVIDER_ROLES = [
  { id: "lead_manager", label: "Lead manager" },
  { id: "administrator", label: "Administrator" },
  { id: "owner", label: "Owner" },
];

const ROLE_TONE = { consumer: "ok", provider: "ok", platform_admin: "warn" };
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Every account, and the one place a role or organization can be set by hand.
 *
 * This is deliberately the only route to platform_admin. Nothing else in the
 * system will grant it: the authenticated role has no write access to
 * profiles.role, and claim_account_type() refuses it outright, both to stop
 * self-promotion from a public form. Doing it here, from an admin session, with
 * an audit entry, is the intended path.
 */
export default function AdminUsers({ token }) {
  const { showToast, adminUser } = useAppState();
  const [users, setUsers] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState(null);
  const [editing, setEditing] = useState(null); // profile id
  const [draft, setDraft] = useState({});
  const [busyId, setBusyId] = useState(null);

  // Ignore a slow response that lands after a newer one.
  const seq = useRef(0);

  const load = useCallback(() => {
    const mine = ++seq.current;
    api
      .adminUsers(token, { q: query.trim() || undefined, role: roleFilter || undefined })
      .then((rows) => {
        if (mine === seq.current) {
          setUsers(rows);
          setError(null);
        }
      })
      .catch((e) => mine === seq.current && setError(e.message));
  }, [token, query, roleFilter]);

  useEffect(() => {
    const timer = setTimeout(load, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    api
      .adminOrgs(token)
      .then(setOrgs)
      .catch(() => setOrgs([]));
  }, [token]);

  const startEdit = (u) => {
    setEditing(u.id);
    setDraft({ role: u.role, orgId: u.orgId || null, providerRole: u.providerRole || "lead_manager" });
  };

  const save = async (u) => {
    setBusyId(u.id);
    try {
      await api.adminUpdateUser(token, u.id, {
        role: draft.role,
        // Only a provider belongs to an organization; the server clears these
        // for any other role regardless of what is sent.
        orgId: draft.role === "provider" ? draft.orgId : null,
        providerRole: draft.role === "provider" && draft.orgId ? draft.providerRole : null,
      });
      showToast("Account updated.");
      setEditing(null);
      load();
    } catch (e) {
      showToast(`Couldn't update: ${e.message}`, "danger");
    } finally {
      setBusyId(null);
    }
  };

  const chip = (label, active, onPress, key) => (
    <Pressable
      key={key || label}
      onPress={onPress}
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
        {label}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView>
      <Text style={[type.h3, { marginBottom: spacing.sm }]}>Accounts</Text>

      <TextField label="Search by name or email" value={query} onChangeText={setQuery} placeholder="Start typing" />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md }}>
        {chip("All", !roleFilter, () => setRoleFilter(null))}
        {ROLES.map((r) => chip(r.label, roleFilter === r.id, () => setRoleFilter(r.id), r.id))}
      </View>

      {error ? <Banner tone="danger">{error}</Banner> : null}
      {!users ? <ActivityIndicator color={colors.primary} /> : null}
      {users && users.length === 0 ? <Text style={type.caption}>No accounts match.</Text> : null}

      {(users || []).map((u) => {
        const isEditing = editing === u.id;
        const isMe = u.id === adminUser?.id;
        return (
          <Card key={u.id} style={{ marginBottom: spacing.md }}>
            <SplitRow
              align="flex-start"
              left={
                <>
                  <Text style={{ fontWeight: "700", marginBottom: 2 }}>
                    {u.name}
                    {isMe ? " (you)" : ""}
                  </Text>
                  <Text style={type.caption}>{u.email}</Text>
                  <Text style={[type.caption, { marginTop: 2 }]}>
                    {u.org ? u.org.name : u.role === "provider" ? "No organization" : "—"}
                    {u.providerRole ? ` · ${u.providerRole.replace("_", " ")}` : ""}
                  </Text>
                  {u.rolePending ? <Text style={[type.caption, { marginTop: 2 }]}>Awaiting role choice</Text> : null}
                  {u.orgClaimStatus === "pending" ? (
                    <Text style={[type.caption, { marginTop: 2 }]}>
                      Claim pending: {u.requestedOrgName || u.requestedOrgId}
                    </Text>
                  ) : null}
                </>
              }
              right={<Badge label={u.role.replace("_", " ")} tone={ROLE_TONE[u.role] || "ok"} />}
            />

            {!isEditing ? (
              <SecondaryButton title="Change role or organization" onPress={() => startEdit(u)} style={{ marginTop: spacing.md }} />
            ) : (
              <View style={{ marginTop: spacing.md }}>
                <Text style={type.label}>Role</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
                  {ROLES.map((r) =>
                    chip(r.label, draft.role === r.id, () => setDraft((d) => ({ ...d, role: r.id })), r.id)
                  )}
                </View>

                {draft.role === "provider" ? (
                  <>
                    <Text style={[type.label, { marginTop: spacing.md }]}>Organization</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
                      {chip("None", !draft.orgId, () => setDraft((d) => ({ ...d, orgId: null })), "none")}
                      {orgs.map((o) =>
                        chip(o.name, draft.orgId === o.id, () => setDraft((d) => ({ ...d, orgId: o.id })), o.id)
                      )}
                    </View>

                    {draft.orgId ? (
                      <>
                        <Text style={[type.label, { marginTop: spacing.md }]}>Permission in that organization</Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
                          {PROVIDER_ROLES.map((r) =>
                            chip(
                              r.label,
                              draft.providerRole === r.id,
                              () => setDraft((d) => ({ ...d, providerRole: r.id })),
                              r.id
                            )
                          )}
                        </View>
                      </>
                    ) : null}
                  </>
                ) : null}

                {draft.role === "platform_admin" && u.role !== "platform_admin" ? (
                  <Banner tone="warn">
                    A platform admin can read and change everything on the platform, including every organization's
                    enquiries. Only do this for someone who should have that.
                  </Banner>
                ) : null}

                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
                  <SecondaryButton title={busyId === u.id ? "Saving…" : "Save"} onPress={() => save(u)} disabled={busyId === u.id} />
                  <SecondaryButton title="Cancel" onPress={() => setEditing(null)} disabled={busyId === u.id} />
                </View>
              </View>
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}
