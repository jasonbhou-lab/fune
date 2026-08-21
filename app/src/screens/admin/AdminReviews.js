import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, Text, ActivityIndicator } from "react-native";
import { Card, Badge, Chip, SecondaryButton, SplitRow, Banner, TextField } from "../../components/ui";
import { Stars } from "../../components/StarRating";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

const FILTERS = [
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
  { id: "dismissed", label: "Dismissed" },
];

const REASON_LABELS = {
  spam: "Spam or advertising",
  off_topic: "Off topic",
  not_a_customer: "Not a real customer",
  offensive: "Offensive",
  privacy: "Shares private information",
  other: "Something else",
};

/**
 * Reported reviews.
 *
 * Two decisions, kept deliberately separate: whether the review comes down, and
 * whether the report is finished with. A report can be dismissed while leaving
 * the review up, and a review can be hidden without closing every report about
 * it, so collapsing them into one button would lose information.
 */
export default function AdminReviews({ token }) {
  const { showToast } = useAppState();
  const [status, setStatus] = useState("open");
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [reasons, setReasons] = useState({});

  const load = useCallback(() => {
    setError(null);
    setReports(null);
    api
      .adminReviewReports(token, status)
      .then(setReports)
      .catch((e) => setError(e.message));
  }, [token, status]);

  useEffect(() => {
    load();
  }, [load]);

  const setReviewStatus = async (report, next) => {
    setBusyId(report.id);
    try {
      await api.adminSetReviewStatus(token, report.review.id, next, reasons[report.id] || "");
      showToast(next === "hidden" ? "Review hidden and removed from the rating." : "Review restored.");
      load();
    } catch (e) {
      showToast(`Couldn't update the review: ${e.message}`, "danger");
    } finally {
      setBusyId(null);
    }
  };

  const setReportStatus = async (report, next) => {
    setBusyId(report.id);
    try {
      await api.adminSetReviewReportStatus(token, report.id, next);
      showToast(`Report ${next}.`);
      load();
    } catch (e) {
      showToast(`Couldn't update the report: ${e.message}`, "danger");
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <Text style={{ color: colors.danger }}>{error}</Text>;

  return (
    <ScrollView>
      <Text style={[type.h3, { marginBottom: spacing.sm }]}>Reported reviews</Text>
      <Banner tone="warn">
        Hiding a review removes it from the provider's page and from their star average. It is a takedown of something a
        member of the public said about a business, so it is recorded in the audit log.
      </Banner>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <Chip key={f.id} label={f.label} active={status === f.id} onPress={() => setStatus(f.id)} />
        ))}
      </View>

      {!reports ? (
        <View style={{ marginTop: spacing.lg }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : reports.length === 0 ? (
        <Text style={[type.caption, { marginTop: spacing.lg }]}>Nothing {status}.</Text>
      ) : null}

      {(reports || []).map((report) => {
        const busy = busyId === report.id;
        const review = report.review;
        return (
          <Card key={report.id} style={{ marginTop: spacing.md }}>
            <SplitRow
              align="flex-start"
              left={
                <>
                  <Text style={{ fontWeight: "700" }}>{REASON_LABELS[report.reason] || report.reason}</Text>
                  <Text style={type.caption}>
                    Reported {new Date(report.createdAt).toLocaleDateString()}
                    {review?.orgName ? ` · ${review.orgName}` : ""}
                  </Text>
                </>
              }
              right={<Badge label={report.status} tone={report.status === "open" ? "warn" : "ok"} />}
            />

            {report.details ? (
              <Text style={{ marginTop: spacing.sm, fontSize: 13, color: colors.muted }}>"{report.details}"</Text>
            ) : null}

            {!review ? (
              <Text style={[type.caption, { marginTop: spacing.md }]}>
                The review has since been deleted by its author.
              </Text>
            ) : (
              <View
                style={{
                  marginTop: spacing.md,
                  padding: spacing.md,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: colors.bg,
                }}
              >
                <SplitRow
                  align="flex-start"
                  left={
                    <>
                      <Text style={{ fontWeight: "700", fontSize: 13 }}>{review.authorName}</Text>
                      <Stars value={review.rating} size={12} />
                    </>
                  }
                  right={review.hidden ? <Badge label="Hidden" tone="danger" /> : <Badge label="Live" tone="ok" />}
                />
                {review.body ? (
                  <Text style={{ marginTop: spacing.sm, lineHeight: 19 }}>{review.body}</Text>
                ) : (
                  <Text style={[type.caption, { marginTop: spacing.sm }]}>Rating only, no text.</Text>
                )}
                {review.response ? (
                  <View style={{ marginTop: spacing.sm, paddingLeft: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.line }}>
                    <Text style={type.label}>Provider reply</Text>
                    <Text style={{ marginTop: 2, fontSize: 13, color: colors.muted }}>{review.response.body}</Text>
                  </View>
                ) : null}
              </View>
            )}

            {review && !review.hidden ? (
              <View style={{ marginTop: spacing.md }}>
                <TextField
                  label="Reason for hiding (recorded in the audit log)"
                  value={reasons[report.id] || ""}
                  onChangeText={(t) => setReasons((prev) => ({ ...prev, [report.id]: t }))}
                  placeholder="e.g. names the deceased"
                />
              </View>
            ) : null}

            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
              {review && !review.hidden ? (
                <SecondaryButton title="Hide review" onPress={() => setReviewStatus(report, "hidden")} disabled={busy} />
              ) : null}
              {review && review.hidden ? (
                <SecondaryButton title="Restore review" onPress={() => setReviewStatus(report, "published")} disabled={busy} />
              ) : null}
              {report.status === "open" ? (
                <>
                  <SecondaryButton title="Mark resolved" onPress={() => setReportStatus(report, "resolved")} disabled={busy} />
                  <SecondaryButton title="Dismiss report" onPress={() => setReportStatus(report, "dismissed")} disabled={busy} />
                </>
              ) : (
                <SecondaryButton title="Reopen" onPress={() => setReportStatus(report, "open")} disabled={busy} />
              )}
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}
