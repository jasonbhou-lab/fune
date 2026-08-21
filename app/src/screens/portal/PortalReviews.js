import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, Text, Pressable, ActivityIndicator } from "react-native";
import { Card, Badge, SecondaryButton, TextField, SplitRow } from "../../components/ui";
import { Stars, RatingHistogram } from "../../components/StarRating";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

const MAX_RESPONSE = 4000;

/**
 * The organization's reviews, and the one thing a provider can do about them:
 * reply in public.
 *
 * A provider cannot edit, hide, or delete a review — only answer it. Reviews
 * they believe are fake go through the same report route as everyone else's, so
 * a platform admin makes the call rather than the subject of the review.
 */
export default function PortalReviews({ token }) {
  const { showToast } = useAppState();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api
      .portalReviews(token)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const startReply = (review) => {
    setEditingId(review.id);
    setDraft(review.response?.body || "");
  };

  const saveReply = async (review) => {
    if (!draft.trim()) {
      showToast("Write something before publishing a reply.", "danger");
      return;
    }
    setSavingId(review.id);
    try {
      await api.portalRespondToReview(token, review.id, draft.trim());
      showToast("Your reply is public.");
      setEditingId(null);
      setDraft("");
      load();
    } catch (e) {
      showToast(`Couldn't save your reply: ${e.message}`, "danger");
    } finally {
      setSavingId(null);
    }
  };

  const removeReply = async (review) => {
    setSavingId(review.id);
    try {
      await api.portalDeleteReviewResponse(token, review.id);
      showToast("Reply removed.");
      load();
    } catch (e) {
      showToast(`Couldn't remove your reply: ${e.message}`, "danger");
    } finally {
      setSavingId(null);
    }
  };

  if (error) return <Text style={{ color: colors.danger }}>{error}</Text>;
  if (!data) return <ActivityIndicator color={colors.primary} />;

  const unanswered = data.reviews.filter((r) => r.needsResponse).length;

  return (
    <ScrollView>
      <Text style={[type.h3, { marginBottom: spacing.md }]}>Reviews</Text>

      <Card style={{ marginBottom: spacing.lg }}>
        {data.summary.count === 0 ? (
          <Text style={{ color: colors.muted }}>
            No one has reviewed you yet. Reviews come from consumers who found you here.
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" }}>
              <View style={{ alignItems: "center", flexShrink: 0 }}>
                <Text style={{ fontSize: 30, fontWeight: "700", lineHeight: 34 }}>{data.summary.average.toFixed(1)}</Text>
                <Stars value={data.summary.average} size={14} />
                <Text style={[type.caption, { marginTop: 4 }]}>
                  {data.summary.count} review{data.summary.count === 1 ? "" : "s"}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <RatingHistogram rating={data.summary} />
              </View>
            </View>
            {unanswered > 0 ? (
              <Text style={[type.caption, { marginTop: spacing.md }]}>
                {unanswered} without a reply. Answering, especially a critical one, is visible to everyone comparing you.
              </Text>
            ) : null}
          </>
        )}
      </Card>

      {data.reviews.map((review) => {
        const busy = savingId === review.id;
        return (
          <Card key={review.id} style={{ marginBottom: spacing.md }}>
            <SplitRow
              align="flex-start"
              left={
                <>
                  <Text style={{ fontWeight: "700" }}>{review.authorName}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 }}>
                    <Stars value={review.rating} size={13} />
                    <Text style={type.caption}>{new Date(review.createdAt).toLocaleDateString()}</Text>
                  </View>
                </>
              }
              right={
                review.hidden ? (
                  <Badge label="Removed by GLP" tone="danger" />
                ) : review.needsResponse ? (
                  <Badge label="No reply" tone="warn" />
                ) : (
                  <Badge label="Replied" tone="ok" />
                )
              }
            />

            {review.body ? (
              <Text style={{ marginTop: spacing.sm, lineHeight: 20 }}>{review.body}</Text>
            ) : (
              <Text style={[type.caption, { marginTop: spacing.sm }]}>Rating only, no written review.</Text>
            )}

            {review.hidden ? (
              <Text style={[type.caption, { marginTop: spacing.sm }]}>
                A platform administrator removed this review. It is hidden from consumers and excluded from your rating.
              </Text>
            ) : editingId === review.id ? (
              <View style={{ marginTop: spacing.md }}>
                <TextField
                  label="Your public reply"
                  value={draft}
                  onChangeText={(t) => setDraft(t.slice(0, MAX_RESPONSE))}
                  placeholder="Reply as the provider. Anyone reading the review will see this."
                  multiline
                  numberOfLines={4}
                />
                <Text style={[type.caption, { textAlign: "right" }]}>
                  {draft.length}/{MAX_RESPONSE}
                </Text>
                <Text style={[type.caption, { marginBottom: spacing.sm, lineHeight: 17 }]}>
                  Don't include anything about the deceased or the family that isn't already in the review.
                </Text>
                <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
                  <SecondaryButton title={busy ? "Saving…" : "Publish reply"} onPress={() => saveReply(review)} disabled={busy} />
                  <SecondaryButton title="Cancel" onPress={() => setEditingId(null)} disabled={busy} />
                </View>
              </View>
            ) : (
              <>
                {review.response ? (
                  <View style={{ marginTop: spacing.md, paddingLeft: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.line }}>
                    <Text style={type.label}>Your reply</Text>
                    <Text style={{ marginTop: 4, lineHeight: 19, color: colors.muted }}>{review.response.body}</Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
                  <SecondaryButton title={review.response ? "Edit reply" : "Reply"} onPress={() => startReply(review)} disabled={busy} />
                  {review.response ? (
                    <Pressable onPress={() => removeReply(review)} disabled={busy} style={{ justifyContent: "center" }}>
                      <Text style={{ color: colors.danger, fontSize: 13 }}>Remove reply</Text>
                    </Pressable>
                  ) : null}
                </View>
              </>
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}
