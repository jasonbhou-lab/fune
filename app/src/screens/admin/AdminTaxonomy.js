import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, Text, ActivityIndicator } from "react-native";
import { Card, TextField, PrimaryButton, SecondaryButton } from "../../components/ui";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

function CategoryRow({ category, token, onChanged }) {
  const { showToast } = useAppState();
  const [label, setLabel] = useState(category.label);
  const [examples, setExamples] = useState(category.examples);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.adminUpdateCategory(token, category.id, { label, examples });
      showToast("Category updated.");
      onChanged();
    } catch (e) {
      showToast(`Couldn't update category: ${e.message}`, "danger");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      const res = await api.adminDeleteCategory(token, category.id);
      showToast(res.offeringsAffected > 0 ? `Removed. ${res.offeringsAffected} offering(s) reference it.` : "Category removed.");
      onChanged();
    } catch (e) {
      showToast(`Couldn't remove category: ${e.message}`, "danger");
      setSaving(false);
    }
  };

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <Text style={type.caption}>{category.id}</Text>
      <TextField label="Label" value={label} onChangeText={setLabel} />
      <TextField label="Examples" value={examples} onChangeText={setExamples} />
      <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
        <SecondaryButton title="Save" onPress={save} disabled={saving} style={{ flex: 1, minWidth: 120 }} />
        <SecondaryButton title="Delete" onPress={remove} disabled={saving} style={{ flex: 1, minWidth: 120 }} />
      </View>
    </Card>
  );
}

export default function AdminTaxonomy({ token }) {
  const { showToast } = useAppState();
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState(null);
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    api.adminTaxonomy(token).then(setCategories).catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const addCategory = async () => {
    if (!newId.trim() || !newLabel.trim()) {
      showToast("An id and label are required.", "danger");
      return;
    }
    setAdding(true);
    try {
      await api.adminAddCategory(token, { id: newId.trim(), label: newLabel.trim(), examples: "" });
      setNewId("");
      setNewLabel("");
      showToast("Category added.");
      load();
    } catch (e) {
      showToast(`Couldn't add category: ${e.message}`, "danger");
    } finally {
      setAdding(false);
    }
  };

  if (error) return <Text style={{ color: colors.danger }}>{error}</Text>;
  if (!categories) return <ActivityIndicator color={colors.primary} />;

  return (
    <ScrollView>
      <Text style={[type.h3, { marginBottom: spacing.md }]}>Taxonomy</Text>
      <Text style={[type.caption, { marginBottom: spacing.md }]}>
        Categories shown here are what consumers browse by and providers assign to offerings.
      </Text>
      {categories.map((c) => (
        <CategoryRow key={c.id} category={c} token={token} onChanged={load} />
      ))}
      <Card style={{ marginBottom: spacing.xl }}>
        <Text style={[type.label, { marginBottom: spacing.sm }]}>Add category</Text>
        <TextField label="Id (e.g. pet_memorial)" value={newId} onChangeText={setNewId} autoCapitalize="none" />
        <TextField label="Label" value={newLabel} onChangeText={setNewLabel} />
        <PrimaryButton title="Add" onPress={addCategory} disabled={adding} />
      </Card>
    </ScrollView>
  );
}
