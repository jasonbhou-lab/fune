import React, { useCallback, useEffect, useState } from "react";
import { Platform, View, Text, Pressable, FlatList, ActivityIndicator } from "react-native";
import { Card, Badge, SecondaryButton, TextField, PrimaryButton, Banner, SplitRow } from "../../components/ui";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

export default function PortalCatalog({ token, onSelect, onCreateNew, refreshKey }) {
  const { showToast } = useAppState();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportText, setExportText] = useState("");
  const [exporting, setExporting] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const load = useCallback(() => {
    api.portalCatalog(token).then(setItems).catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const runExport = async () => {
    setExporting(true);
    try {
      const csv = await api.portalExportCatalog(token);
      setExportText(csv);
      setExportOpen(true);
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "catalog-export.csv";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      showToast(`Couldn't export catalog: ${e.message}`, "danger");
    } finally {
      setExporting(false);
    }
  };

  const runImport = async () => {
    if (!importText.trim()) {
      showToast("Paste CSV content first.", "danger");
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const result = await api.portalImportCatalog(token, importText);
      setImportResult(result);
      showToast(`Imported: ${result.created} created, ${result.updated} updated${result.errors.length ? `, ${result.errors.length} row error(s)` : ""}.`);
      load();
    } catch (e) {
      showToast(`Import failed: ${e.message}`, "danger");
    } finally {
      setImporting(false);
    }
  };

  if (error) return <Text style={{ color: colors.danger }}>{error}</Text>;
  if (!items) return <ActivityIndicator color={colors.primary} />;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm, flexWrap: "wrap", gap: spacing.sm }}>
        <Text style={type.h3}>Catalog & pricing</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          <SecondaryButton title="Export CSV" onPress={runExport} disabled={exporting} style={{ paddingVertical: 6, paddingHorizontal: 10 }} />
          <SecondaryButton title="Import CSV" onPress={() => setImportOpen((v) => !v)} style={{ paddingVertical: 6, paddingHorizontal: 10 }} />
          <SecondaryButton title="+ New offering" onPress={onCreateNew} style={{ paddingVertical: 6, paddingHorizontal: 10 }} />
        </View>
      </View>

      {exportOpen && (
        <Card style={{ marginBottom: spacing.md }}>
          <Text style={[type.label, { marginBottom: spacing.sm }]}>
            {Platform.OS === "web" ? "Downloaded as catalog-export.csv. Content below for reference:" : "Select and copy the CSV below:"}
          </Text>
          <Text selectable style={{ fontSize: 11, fontFamily: Platform.OS === "web" ? "monospace" : undefined }}>
            {exportText}
          </Text>
          <SecondaryButton title="Close" onPress={() => setExportOpen(false)} style={{ marginTop: spacing.sm }} />
        </Card>
      )}

      {importOpen && (
        <Card style={{ marginBottom: spacing.md }}>
          <Text style={[type.label, { marginBottom: spacing.sm }]}>Paste CSV (same columns as export — include an id to update, leave it blank to create)</Text>
          <TextField label="CSV content" value={importText} onChangeText={setImportText} multiline numberOfLines={6} />
          <PrimaryButton title="Run import" onPress={runImport} loading={importing} />
          {importResult && importResult.errors.length > 0 && (
            <Banner tone="danger">{importResult.errors.map((e) => `Row ${e.row}: ${e.error}`).join("\n")}</Banner>
          )}
        </Card>
      )}

      <FlatList
        data={items}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ gap: spacing.sm }}
        renderItem={({ item }) => (
          <Pressable onPress={() => onSelect(item)}>
            <Card>
              <SplitRow
                align="flex-start"
                left={<Text style={{ fontWeight: "700" }}>{item.name}</Text>}
                right={
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {item.stale && <Badge label="Needs review" tone="warn" />}
                    <Badge
                      label={item.status.replace("_", " ")}
                      tone={item.status === "published" ? "ok" : item.status === "pending_review" ? "warn" : "warn"}
                    />
                  </View>
                }
              />
              <Text style={type.caption}>
                {item.category} · {item.price.text} · reviewed {new Date(item.reviewedDate).toLocaleDateString()}
              </Text>
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}
