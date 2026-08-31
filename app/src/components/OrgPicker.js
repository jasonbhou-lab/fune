import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { TextField } from "./ui";
import { api } from "../api";
import { colors, spacing, type } from "../theme";

const SEARCH_DEBOUNCE_MS = 300;
const NOT_LISTED = "__not_listed__";

/**
 * "Which organization do you work for?" for provider signup.
 *
 * Reports the choice as either { orgId } for an organization already on the
 * platform, or { orgName } for one that isn't listed yet. Never both — the
 * database enforces the same rule.
 *
 * Worth being clear about what this is not: picking an organization here does
 * not join it. It records a claim for a platform admin to approve, because
 * org_id is what unlocks that organization's leads, and those carry bereaved
 * families' contact details. The copy below says so, so nobody expects instant
 * access and then thinks the portal is broken.
 */
export default function OrgPicker({ value, onChange, labelColor, onGradientMuted }) {
  const [query, setQuery] = useState("");
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [newOrgName, setNewOrgName] = useState("");

  // Ignore a slow response that lands after a newer one, which would otherwise
  // repopulate the list with results for a query the user has moved on from.
  const requestSeq = useRef(0);

  useEffect(() => {
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const results = await api.orgDirectory(query.trim());
        if (seq === requestSeq.current) setOrgs(Array.isArray(results) ? results : []);
      } catch (e) {
        if (seq === requestSeq.current) setLoadError(e.message);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const selectedId = value?.orgId || (value?.orgName != null ? NOT_LISTED : null);

  const choose = (org) => {
    setNewOrgName("");
    onChange({ orgId: org.id, orgName: null });
  };

  const chooseNotListed = () => {
    onChange({ orgId: null, orgName: newOrgName.trim() ? newOrgName.trim() : "" });
  };

  const row = (key, label, sublabel, active, onPress) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={{
        borderWidth: active ? 2 : 1,
        borderColor: active ? colors.primaryInk : "rgba(255,255,255,0.45)",
        backgroundColor: active ? "rgba(255,255,255,0.18)" : "transparent",
        borderRadius: 10,
        padding: 12,
        marginBottom: spacing.sm,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
      }}
    >
      <Text style={{ color: colors.primaryInk, fontSize: 13 }}>{active ? "●" : "○"}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.primaryInk, fontWeight: active ? "700" : "500" }}>{label}</Text>
        {sublabel ? (
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>{sublabel}</Text>
        ) : null}
      </View>
    </Pressable>
  );

  return (
    <View>
      <Text style={[type.label, onGradientMuted, { marginBottom: spacing.sm }]}>
        Your organization (required)
      </Text>

      <TextField
        label="Search funeral homes"
        value={query}
        onChangeText={setQuery}
        placeholder="Start typing a name"
        labelColor={labelColor}
      />

      {loading ? (
        <View style={{ paddingVertical: spacing.md, alignItems: "center" }}>
          <ActivityIndicator color={colors.primaryInk} />
        </View>
      ) : null}

      {loadError ? (
        <Text style={{ color: colors.dangerSoft, fontSize: 12, marginBottom: spacing.sm }}>
          Couldn't load the organization list ({loadError}). You can still enter your organization's name below.
        </Text>
      ) : null}

      {!loading && !loadError && orgs.length === 0 ? (
        <Text style={[type.caption, onGradientMuted, { marginBottom: spacing.sm }]}>
          {query.trim() ? `No organizations match "${query.trim()}".` : "No organizations listed yet."}
        </Text>
      ) : null}

      {orgs.map((org) =>
        row(org.id, org.name, org.verified ? "Verified on The Final Choice" : "Not yet verified", selectedId === org.id, () => choose(org))
      )}

      {row(
        NOT_LISTED,
        "My organization isn't listed",
        "We'll add it when your request is reviewed",
        selectedId === NOT_LISTED,
        chooseNotListed
      )}

      {selectedId === NOT_LISTED ? (
        <TextField
          label="Organization name"
          value={newOrgName}
          onChangeText={(text) => {
            setNewOrgName(text);
            onChange({ orgId: null, orgName: text.trim() });
          }}
          placeholder="e.g. Sunset Rest Funeral Home"
          labelColor={labelColor}
        />
      ) : null}

      <Text style={[type.caption, onGradientMuted, { marginTop: 2, marginBottom: spacing.md, lineHeight: 17 }]}>
        Choosing an organization requests access to it. A platform administrator reviews the request before your account
        is connected, so you won't see its listings or enquiries straight away.
      </Text>
    </View>
  );
}
