import React, { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { TextField, PrimaryButton, SecondaryButton, Banner, Chip } from "../../components/ui";
import { api } from "../../api";
import { CATEGORIES } from "../../categories";
import { colors, spacing, type } from "../../theme";

const PRICE_TYPES = [
  { id: "fixed", label: "Fixed" },
  { id: "starting_at", label: "Starting at" },
  { id: "range", label: "Range" },
  { id: "quote_required", label: "Quote req." },
];

function toCsv(arr) {
  return (arr || []).join(", ");
}
function fromCsv(str) {
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function PortalCatalogEditor({ token, offering, locationId, onDone, onCancel }) {
  const isNew = !offering;
  const [name, setName] = useState(offering?.name || "");
  const [category, setCategory] = useState(offering?.category || "cremation");
  const [priceType, setPriceType] = useState(offering?.priceType || "fixed");
  const [amount, setAmount] = useState(offering?.amount ? String(offering.amount) : "");
  const [amountMin, setAmountMin] = useState(offering?.amountMin ? String(offering.amountMin) : "");
  const [amountMax, setAmountMax] = useState(offering?.amountMax ? String(offering.amountMax) : "");
  const [included, setIncluded] = useState(toCsv(offering?.included));
  const [excluded, setExcluded] = useState(toCsv(offering?.excluded));
  const [hasThirdParty, setHasThirdParty] = useState((offering?.thirdParty || []).length > 0);
  const [tpLabel, setTpLabel] = useState(offering?.thirdParty?.[0]?.label || "");
  const [tpAmount, setTpAmount] = useState(offering?.thirdParty?.[0]?.amount ? String(offering.thirdParty[0].amount) : "");
  const [tpUnknown, setTpUnknown] = useState(offering?.thirdParty?.[0]?.status === "unknown");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const buildPayload = (status) => ({
    name,
    category,
    priceType,
    amount: priceType === "fixed" || priceType === "starting_at" ? Number(amount) || null : null,
    amountMin: priceType === "range" ? Number(amountMin) || null : null,
    amountMax: priceType === "range" ? Number(amountMax) || null : null,
    included: fromCsv(included),
    excluded: fromCsv(excluded),
    thirdParty: hasThirdParty
      ? [{ label: tpLabel || "Third-party fee", amount: tpUnknown ? null : Number(tpAmount) || null, status: tpUnknown ? "unknown" : "estimated" }]
      : [],
    status,
  });

  const save = async (status) => {
    setError(null);
    setSaving(true);
    try {
      if (isNew) {
        const created = await api.portalCreateOffering(token, { locationId, ...buildPayload(status === "published" ? "draft" : status) });
        if (status === "published") {
          await api.portalUpdateOffering(token, created.id, buildPayload("published"));
        }
      } else {
        await api.portalUpdateOffering(token, offering.id, buildPayload(status));
      }
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView>
      <Pressable onPress={onCancel} style={{ marginBottom: spacing.md }}>
        <Text style={{ color: colors.primary, fontWeight: "600" }}>← Back to catalog</Text>
      </Pressable>
      <Text style={[type.h3, { marginBottom: spacing.md }]}>{isNew ? "New offering" : offering.name}</Text>
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <TextField label="Name" value={name} onChangeText={setName} />

      <Text style={[type.label, { marginBottom: 6 }]}>Category</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.md }}>
        {CATEGORIES.map((c) => (
          <Chip key={c.id} label={c.label} active={category === c.id} onPress={() => setCategory(c.id)} />
        ))}
      </View>

      <Text style={[type.label, { marginBottom: 6 }]}>Price type</Text>
      <View style={{ flexDirection: "row", marginBottom: spacing.md }}>
        {PRICE_TYPES.map((p) => (
          <Chip key={p.id} label={p.label} active={priceType === p.id} onPress={() => setPriceType(p.id)} />
        ))}
      </View>

      {priceType === "fixed" || priceType === "starting_at" ? (
        <TextField label="Amount (USD)" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="1395" />
      ) : null}
      {priceType === "range" ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TextField label="Min (USD)" value={amountMin} onChangeText={setAmountMin} keyboardType="numeric" />
          <TextField label="Max (USD)" value={amountMax} onChangeText={setAmountMax} keyboardType="numeric" />
        </View>
      ) : null}

      <TextField label="Included (comma-separated)" value={included} onChangeText={setIncluded} placeholder="Transfer of remains, Basic container" />
      <TextField label="Excluded (comma-separated)" value={excluded} onChangeText={setExcluded} placeholder="Urn or scattering fee" />

      <Pressable onPress={() => setHasThirdParty((v) => !v)} style={{ marginBottom: spacing.sm }}>
        <Text style={{ color: colors.primary, fontWeight: "600" }}>
          {hasThirdParty ? "✓ " : "+ "}Has a separate third-party charge
        </Text>
      </Pressable>
      {hasThirdParty ? (
        <View>
          <TextField label="Charge label" value={tpLabel} onChangeText={setTpLabel} placeholder="Crematory fee" />
          {!tpUnknown ? <TextField label="Estimated amount (USD)" value={tpAmount} onChangeText={setTpAmount} keyboardType="numeric" /> : null}
          <Pressable onPress={() => setTpUnknown((v) => !v)} style={{ marginBottom: spacing.md }}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{tpUnknown ? "☑" : "☐"} Amount is unknown</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.xl }}>
        <SecondaryButton title="Save draft" onPress={() => save("draft")} disabled={saving} style={{ flex: 1 }} />
        <PrimaryButton title="Publish" onPress={() => save("published")} loading={saving} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  );
}
