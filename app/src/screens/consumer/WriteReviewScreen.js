import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Screen, Card, TextField, PrimaryButton, SecondaryButton, Banner } from "../../components/ui";
import { StarInput } from "../../components/StarRating";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

const MAX_BODY = 4000;

const RATING_WORDS = {
  1: "Poor",
  2: "Not great",
  3: "Fine",
  4: "Good",
  5: "Excellent",
};

/**
 * Write, change, or remove your review of a provider.
 *
 * One review per person per provider, so this doubles as the edit form: arriving
 * with an existing review pre-fills it and the save replaces it, which is how
 * Google behaves and what the unique constraint in the database requires anyway.
 */
export default function WriteReviewScreen({ route, navigation }) {
  const { orgId, orgName, existing } = route.params || {};
  const { consumerToken, showToast } = useAppState();

  const [rating, setRating] = useState(existing?.rating || null);
  const [body, setBody] = useState(existing?.body || "");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const save = async () => {
    setError(null);
    if (!rating) {
      setError("Choose a star rating. The written part is optional.");
      return;
    }
    setSaving(true);
    try {
      await api.submitReview(consumerToken, orgId, { rating, body: body.trim() });
      showToast(existing ? "Your review has been updated." : "Thanks — your review is live.");
      navigation.goBack();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await api.deleteMyReview(consumerToken, orgId);
      showToast("Your review has been removed.");
      navigation.goBack();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Text style={[type.h2, { marginBottom: 4 }]}>{existing ? "Edit your review" : "Review this provider"}</Text>
      <Text style={[type.caption, { marginBottom: spacing.lg }]}>{orgName}</Text>

      {error ? <Banner tone="danger">{error}</Banner> : null}

      <Card>
        <Text style={type.label}>Your rating (required)</Text>
        <View style={{ marginTop: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <StarInput value={rating} onChange={setRating} disabled={saving} />
          {rating ? <Text style={{ color: colors.muted, fontSize: 13 }}>{RATING_WORDS[rating]}</Text> : null}
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <TextField
            label="Your review (optional)"
            value={body}
            onChangeText={(text) => setBody(text.slice(0, MAX_BODY))}
            placeholder="What was your experience arranging with them?"
            multiline
            numberOfLines={6}
          />
          <Text style={[type.caption, { textAlign: "right" }]}>
            {body.length}/{MAX_BODY}
          </Text>
        </View>
      </Card>

      <Text style={[type.caption, { marginTop: spacing.md, lineHeight: 17 }]}>
        Your review is public and shows the name on your account. The provider can reply to it. Please describe your own
        experience only, and leave out anything private about the person who died or their family.
      </Text>

      <View style={{ marginTop: spacing.lg }}>
        <PrimaryButton title={existing ? "Save changes" : "Post review"} onPress={save} loading={saving} />
      </View>

      {existing ? (
        <View style={{ marginTop: spacing.lg }}>
          {confirmingDelete ? (
            <Card>
              <Text style={{ marginBottom: spacing.md, color: colors.ink }}>
                Remove your review of {orgName}? This can't be undone, and it will stop counting towards their rating.
              </Text>
              <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
                <SecondaryButton title="Yes, remove it" onPress={remove} disabled={saving} />
                <SecondaryButton title="Keep it" onPress={() => setConfirmingDelete(false)} disabled={saving} />
              </View>
            </Card>
          ) : (
            <Pressable onPress={() => setConfirmingDelete(true)}>
              <Text style={{ color: colors.danger, textAlign: "center", fontSize: 13 }}>Delete my review</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </Screen>
  );
}
