import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Screen, ScrollScreen, PrimaryButton, SecondaryButton, CheckboxRow } from "../../components/ui";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { ATTRIBUTES, activeFilterCount } from "../../attributes";
import { colors, spacing, type } from "../../theme";

export default function FiltersScreen({ navigation }) {
  const { filters, setFilters, clearFilters } = useAppState();
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
  }, []);

  const count = activeFilterCount(filters);

  return (
    <ScrollScreen contentStyle={{ flexGrow: 1 }}>
        <Text style={[type.label, { marginBottom: spacing.sm }]}>Service type</Text>
        <Pressable
          onPress={() => setFilters({ category: null })}
          style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }}
        >
          <View style={[styles.checkbox, !filters.category && styles.checkboxChecked]}>
            {!filters.category ? <Text style={styles.check}>✓</Text> : null}
          </View>
          <Text style={styles.optLabel}>All categories</Text>
        </Pressable>
        {categories.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setFilters({ category: filters.category === c.id ? null : c.id })}
            style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }}
          >
            <View style={[styles.checkbox, filters.category === c.id && styles.checkboxChecked]}>
              {filters.category === c.id ? <Text style={styles.check}>✓</Text> : null}
            </View>
            <Text style={styles.optLabel}>{c.label}</Text>
          </Pressable>
        ))}

        <Text style={[type.label, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>Accommodations</Text>
        {ATTRIBUTES.map((a) => (
          <CheckboxRow
            key={a.key}
            label={a.label}
            checked={Boolean(filters[a.key])}
            onToggle={() => setFilters({ [a.key]: !filters[a.key] })}
          />
        ))}

        <Text style={[type.label, { marginTop: spacing.md, marginBottom: spacing.sm }]}>Availability</Text>
        <CheckboxRow
          label="Verified providers only"
          checked={Boolean(filters.verifiedOnly)}
          onToggle={() => setFilters({ verifiedOnly: !filters.verifiedOnly })}
        />

        <View style={{ flex: 1 }} />

        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
          <SecondaryButton title="Clear all" onPress={clearFilters} style={{ flex: 1 }} />
          <PrimaryButton title={`Apply${count ? ` (${count})` : ""}`} onPress={() => navigation.goBack()} style={{ flex: 1 }} />
        </View>
    </ScrollScreen>
  );
}

const styles = {
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.line,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  check: { color: colors.primaryInk, fontSize: 11, fontWeight: "700" },
  optLabel: { fontSize: 13, color: colors.ink },
};
