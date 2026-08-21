import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Card, Chip, SecondaryButton } from "./ui";
import { Stars, RatingHistogram } from "./StarRating";
import { api } from "../api";
import { useAppState } from "../context/AppState";
import { colors, spacing, type } from "../theme";

const SORTS = [
  { id: "recent", label: "Most recent" },
  { id: "highest", label: "Highest" },
  { id: "lowest", label: "Lowest" },
];

const REPORT_REASONS = [
  { id: "not_a_customer", label: "Not a real customer" },
  { id: "spam", label: "Spam or advertising" },
  { id: "offensive", label: "Offensive" },
  { id: "privacy", label: "Shares private information" },
  { id: "off_topic", label: "Off topic" },
  { id: "other", label: "Something else" },
];

function relativeDate(iso) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/** One review, with the provider's reply and a report control. */
function ReviewCard({ review, onReport }) {
  const [reporting, setReporting] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontWeight: "700" }}>{review.authorName}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 }}>
            <Stars value={review.rating} size={13} />
            <Text style={type.caption}>
              {relativeDate(review.createdAt)}
              {review.edited ? " · edited" : ""}
            </Text>
          </View>
        </View>
        {review.mine ? (
          <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "700", flexShrink: 0 }}>Your review</Text>
        ) : null}
      </View>

      {review.body ? (
        <Text style={{ marginTop: spacing.sm, lineHeight: 20, color: colors.ink }}>{review.body}</Text>
      ) : null}

      {review.response ? (
        <View
          style={{
            marginTop: spacing.md,
            paddingLeft: spacing.md,
            borderLeftWidth: 3,
            borderLeftColor: colors.line,
          }}
        >
          <Text style={type.label}>Response from the provider</Text>
          <Text style={{ marginTop: 4, lineHeight: 19, color: colors.muted }}>{review.response.body}</Text>
        </View>
      ) : null}

      {/* Reporting is open to anyone reading, including signed-out visitors —
          the person most likely to spot a fake review is whoever it misleads. */}
      {!review.mine ? (
        sent ? (
          <Text style={[type.caption, { marginTop: spacing.md }]}>Thanks — we'll take a look.</Text>
        ) : reporting ? (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Text style={type.label}>Why are you reporting this?</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {REPORT_REASONS.map((r) => (
                <Chip
                  key={r.id}
                  label={r.label}
                  active={false}
                  onPress={async () => {
                    await onReport(review, r.id);
                    setSent(true);
                    setReporting(false);
                  }}
                />
              ))}
            </View>
            <Pressable onPress={() => setReporting(false)}>
              <Text style={[type.caption, { color: colors.primary }]}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setReporting(true)} style={{ marginTop: spacing.md }}>
            <Text style={[type.caption, { color: colors.faint }]}>Report</Text>
          </Pressable>
        )
      ) : null}
    </Card>
  );
}

/**
 * The reviews block for a provider, Google-shaped: a headline average with the
 * 1-5 histogram, a sort control, rating filters, a paged list, and the viewer's
 * own review surfaced as editable rather than duplicable.
 *
 * Takes orgId rather than an offering, because a review is about the business,
 * not one price on one of its price lists.
 */
export default function ReviewsSection({ orgId, orgName, onWriteReview }) {
  const { consumerToken, showToast } = useAppState();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState("recent");
  const [ratingFilter, setRatingFilter] = useState(null);
  const [page, setPage] = useState(0);
  const [extraPages, setExtraPages] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await api.orgReviews(orgId, { sort, rating: ratingFilter }, consumerToken);
      setData(result);
      setExtraPages([]);
      setPage(0);
    } catch (e) {
      setError(e.message);
    }
  }, [orgId, sort, ratingFilter, consumerToken]);

  useEffect(() => {
    load();
  }, [load]);

  const showMore = async () => {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const result = await api.orgReviews(orgId, { sort, rating: ratingFilter, page: next }, consumerToken);
      setExtraPages((prev) => [...prev, ...result.reviews]);
      setPage(next);
    } catch (e) {
      showToast(`Couldn't load more reviews: ${e.message}`, "danger");
    } finally {
      setLoadingMore(false);
    }
  };

  const report = async (review, reason) => {
    try {
      await api.reportReview(review.id, { reason }, consumerToken);
    } catch (e) {
      showToast(`Couldn't send that report: ${e.message}`, "danger");
    }
  };

  if (error) {
    return (
      <Card style={{ marginTop: spacing.lg }}>
        <Text style={{ color: colors.danger }}>Couldn't load reviews: {error}</Text>
      </Card>
    );
  }
  if (!data) {
    return (
      <View style={{ marginTop: spacing.lg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const shown = [...data.reviews, ...extraPages];
  const hasMore = shown.length < data.matched;
  const summary = data.summary;

  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={[type.h2, { marginBottom: spacing.md }]}>Reviews of {orgName}</Text>

      <Card>
        {summary.count === 0 ? (
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            No one has reviewed {orgName} yet. If you've dealt with them, yours would be the first.
          </Text>
        ) : (
          <View style={{ flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" }}>
            <View style={{ alignItems: "center", flexShrink: 0 }}>
              <Text style={{ fontSize: 34, fontWeight: "700", color: colors.ink, lineHeight: 38 }}>
                {summary.average.toFixed(1)}
              </Text>
              <Stars value={summary.average} size={15} />
              <Text style={[type.caption, { marginTop: 4 }]}>
                {summary.count} review{summary.count === 1 ? "" : "s"}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <RatingHistogram rating={summary} onSelectRating={setRatingFilter} selectedRating={ratingFilter} />
            </View>
          </View>
        )}

        <View style={{ marginTop: spacing.lg }}>
          <SecondaryButton
            title={data.myReview ? "Edit your review" : "Write a review"}
            onPress={() => onWriteReview(data.myReview)}
          />
        </View>
      </Card>

      {summary.count > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg }}>
          {SORTS.map((s) => (
            <Chip key={s.id} label={s.label} active={sort === s.id} onPress={() => setSort(s.id)} />
          ))}
          {ratingFilter ? (
            <Chip label={`${ratingFilter} star only ✕`} active onPress={() => setRatingFilter(null)} />
          ) : null}
        </View>
      ) : null}

      <View style={{ marginTop: spacing.md }}>
        {shown.length === 0 && summary.count > 0 ? (
          <Text style={type.caption}>No reviews match that filter.</Text>
        ) : null}
        {shown.map((r) => (
          <ReviewCard key={r.id} review={r} onReport={report} />
        ))}
      </View>

      {hasMore ? (
        <SecondaryButton
          title={loadingMore ? "Loading…" : `Show more reviews (${data.matched - shown.length} left)`}
          onPress={showMore}
          disabled={loadingMore}
        />
      ) : null}
    </View>
  );
}
