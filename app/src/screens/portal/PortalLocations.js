import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Card, SplitRow } from "../../components/ui";
import { api } from "../../api";
import { ATTRIBUTES } from "../../attributes";
import { colors, spacing, type } from "../../theme";

function Toggle({ value, onChange }) {
  return (
    <Pressable
      onPress={onChange}
      style={{
        width: 40,
        height: 24,
        borderRadius: 12,
        backgroundColor: value ? colors.primary : colors.bgSunk,
        borderWidth: 1,
        borderColor: value ? colors.primary : colors.line,
        padding: 2,
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: value ? colors.primaryInk : colors.faint,
          alignSelf: value ? "flex-end" : "flex-start",
        }}
      />
    </Pressable>
  );
}

export default function PortalLocations({ token }) {
  const [locations, setLocations] = useState(null);
  const [error, setError] = useState(null);
  const [savingKey, setSavingKey] = useState(null);

  useEffect(() => {
    api.portalLocations(token).then(setLocations).catch((e) => setError(e.message));
  }, [token]);

  const toggle = async (location, key) => {
    const nextValue = !location[key];
    setSavingKey(`${location.id}:${key}`);
    setLocations((prev) => prev.map((l) => (l.id === location.id ? { ...l, [key]: nextValue } : l)));
    try {
      await api.portalUpdateLocation(token, location.id, { [key]: nextValue });
    } catch (e) {
      // revert on failure
      setLocations((prev) => prev.map((l) => (l.id === location.id ? { ...l, [key]: !nextValue } : l)));
      setError(e.message);
    } finally {
      setSavingKey(null);
    }
  };

  if (error) return <Text style={{ color: colors.danger }}>{error}</Text>;
  if (!locations) return <ActivityIndicator color={colors.primary} />;

  return (
    <ScrollView>
      <Text style={[type.h3, { marginBottom: spacing.md }]}>Locations</Text>
      <Text style={[type.caption, { marginBottom: spacing.md }]}>
        These accommodations are what consumers filter search results by.
      </Text>
      {locations.map((loc) => (
        <Card key={loc.id} style={{ marginBottom: spacing.md }}>
          <Text style={{ fontWeight: "700", marginBottom: 2 }}>{loc.name}</Text>
          <Text style={[type.caption, { marginBottom: spacing.md }]}>
            {loc.address}, {loc.city}, {loc.state} {loc.zip}
          </Text>
          {ATTRIBUTES.map((a) => (
            <SplitRow
              key={a.key}
              style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line }}
              left={<Text style={{ fontSize: 13 }}>{a.label}</Text>}
              right={<Toggle value={Boolean(loc[a.key])} onChange={() => toggle(loc, a.key)} />}
            />
          ))}
        </Card>
      ))}
    </ScrollView>
  );
}
