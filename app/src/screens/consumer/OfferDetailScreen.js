import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { Screen, Card, Badge, Banner, Chip, TextField, PrimaryButton, SecondaryButton } from "../../components/ui";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

const REPORT_REASONS = [
  { id: "price_seems_wrong", label: "Price seems wrong" },
  { id: "listing_outdated", label: "Listing looks outdated" },
  { id: "other", label: "Other" },
];

export default function OfferDetailScreen({ navigation, route }) {
  const { offeringId } = route.params;
  const { compareTray, addToCompare, consumerToken, showToast } = useAppState();
  const [offering, setOffering] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(null);
  const [reportDetails, setReportDetails] = useState("");
  const [reportSaving, setReportSaving] = useState(false);

  useEffect(() => {
    api
      .offering(offeringId)
      .then(setOffering)
      .catch((e) => setError(e.message));
  }, [offeringId]);

  useEffect(() => {
    if (!offering) return;
    api
      .saved(consumerToken)
      .then((res) => setSaved(res.providers.some((p) => p.id === offering.location.id)))
      .catch(() => {});
  }, [consumerToken, offering?.location.id]);

  const toggleSave = async () => {
    setSavingProvider(true);
    try {
      if (saved) {
        await api.unsaveProvider(consumerToken, offering.location.id);
        setSaved(false);
        showToast("Removed from saved providers.");
      } else {
        await api.saveProvider(consumerToken, offering.location.id);
        setSaved(true);
        showToast("Saved provider.");
      }
    } catch (e) {
      showToast(`Couldn't update saved providers: ${e.message}`, "danger");
    } finally {
      setSavingProvider(false);
    }
  };

  const submitReport = async () => {
    if (!reportReason) {
      showToast("Choose a reason before submitting.", "danger");
      return;
    }
    setReportSaving(true);
    try {
      await api.submitReport({ offeringId: offering.id, reason: reportReason, details: reportDetails }, consumerToken);
      showToast("Thanks — our team will review this listing.");
      setReportOpen(false);
      setReportReason(null);
      setReportDetails("");
    } catch (e) {
      showToast(`Couldn't submit report: ${e.message}`, "danger");
    } finally {
      setReportSaving(false);
    }
  };

  if (error) {
    return (
      <Screen>
        <Text style={{ color: colors.danger }}>{error}</Text>
      </Screen>
    );
  }
  if (!offering) {
    return (
      <Screen style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  const inTray = compareTray.includes(offering.id);

  return (
    <Screen>
      <ScrollView>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Badge label={offering.location.verified ? "Verified" : "Unverified"} tone={offering.location.verified ? "ok" : "warn"} />
          <Pressable
            onPress={toggleSave}
            disabled={savingProvider}
            hitSlop={12}
            style={{ padding: 10 }}
            accessibilityRole="button"
            accessibilityLabel={saved ? "Remove from saved providers" : "Save provider"}
          >
            <Text style={{ fontSize: 20, color: saved ? colors.danger : colors.faint }}>{saved ? "♥" : "♡"}</Text>
          </Pressable>
        </View>
        <Text style={[type.h2, { marginTop: 8 }]}>{offering.location.orgName}</Text>
        <Text style={type.caption}>
          {offering.location.address} · {offering.location.city}, {offering.location.state}
        </Text>
        <Text style={[type.caption, { marginBottom: spacing.md }]}>{offering.location.phone} · {offering.location.hours}</Text>

        <Card>
          <Text style={type.label}>{offering.name}</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
            <Text style={{ fontSize: 22, fontWeight: "700" }}>{offering.price.text}</Text>
            <Text style={type.caption}>{offering.price.label}</Text>
          </View>
          <Text style={type.caption}>
            Effective {new Date(offering.effectiveDate).toLocaleDateString()} · reviewed {offering.reviewedDaysAgo} days ago
          </Text>
        </Card>

        <View style={{ marginTop: spacing.md, gap: 6 }}>
          {offering.included.map((line) => (
            <Text key={line} style={{ color: colors.ok }}>✓ <Text style={{ color: colors.ink }}>{line}</Text></Text>
          ))}
          {offering.excluded.map((line) => (
            <Text key={line} style={{ color: colors.faint }}>— {line}</Text>
          ))}
        </View>

        {offering.thirdParty.map((tp) => (
          <Banner key={tp.label} tone="warn">
            {tp.label} {tp.status === "estimated" ? `($${tp.amount})` : ""} is a separate,{" "}
            {tp.status === "unknown" ? "unknown" : "estimated"} third-party charge.
          </Banner>
        ))}

        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.xl }}>
          <SecondaryButton
            title={inTray ? "✓ In comparison" : "Add to compare"}
            onPress={() => addToCompare(offering.id)}
            disabled={inTray}
            style={{ flex: 1 }}
          />
          <PrimaryButton
            title="Request pricing"
            onPress={() => navigation.navigate("LeadForm", { locationId: offering.location.id, offeringId: offering.id, providerName: offering.location.orgName })}
            style={{ flex: 1 }}
          />
        </View>

        <Pressable onPress={() => setReportOpen((v) => !v)} style={{ marginBottom: spacing.xl }}>
          <Text style={{ color: colors.faint, fontSize: 12, textDecorationLine: "underline" }}>
            {reportOpen ? "Cancel report" : "Report inaccurate pricing"}
          </Text>
        </Pressable>

        {reportOpen && (
          <Card style={{ marginBottom: spacing.xl }}>
            <Text style={[type.label, { marginBottom: spacing.sm }]}>What's wrong?</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.sm }}>
              {REPORT_REASONS.map((r) => (
                <Chip key={r.id} label={r.label} active={reportReason === r.id} onPress={() => setReportReason(r.id)} />
              ))}
            </View>
            <TextField label="Details (optional)" value={reportDetails} onChangeText={setReportDetails} placeholder="Tell us what looks off" />
            <PrimaryButton title="Submit report" onPress={submitReport} loading={reportSaving} />
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
