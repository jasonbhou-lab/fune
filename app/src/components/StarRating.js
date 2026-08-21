import React from "react";
import { View, Text, Pressable } from "react-native";
import { colors, spacing } from "../theme";

const STARS = [1, 2, 3, 4, 5];
const FILLED = "★";
const EMPTY = "☆";

/**
 * Stars, for reading and for choosing.
 *
 * Read-only mode rounds to the nearest half and renders a half star, because a
 * 4.4 average shown as 4 whole stars quietly misrepresents the business either
 * way. Interactive mode is whole stars only — there is no way to tap half a
 * star, and offering one would produce ratings nobody meant.
 */
export function Stars({ value, size = 16, color = colors.accent, emptyColor = colors.line }) {
  const rounded = Math.round((Number(value) || 0) * 2) / 2;
  return (
    <View style={{ flexDirection: "row" }} accessibilityLabel={`${rounded} out of 5 stars`}>
      {STARS.map((n) => {
        const full = rounded >= n;
        const half = !full && rounded >= n - 0.5;
        if (half) {
          // A clipped filled star laid over an empty one: no half-star glyph
          // exists in the base character set, and an image would need an asset.
          return (
            <View key={n} style={{ width: size * 0.95 }}>
              <Text style={{ fontSize: size, color: emptyColor, position: "absolute" }}>{FILLED}</Text>
              <View style={{ width: size * 0.5, overflow: "hidden" }}>
                <Text style={{ fontSize: size, color }}>{FILLED}</Text>
              </View>
            </View>
          );
        }
        return (
          <Text key={n} style={{ fontSize: size, color: full ? color : emptyColor, width: size * 0.95 }}>
            {full ? FILLED : EMPTY}
          </Text>
        );
      })}
    </View>
  );
}

/** Whole-star picker. `value` of null means nothing chosen yet. */
export function StarInput({ value, onChange, size = 32, disabled }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.xs || 4 }}>
      {STARS.map((n) => {
        const on = (value || 0) >= n;
        return (
          <Pressable
            key={n}
            disabled={disabled}
            onPress={() => onChange(n)}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === n }}
            accessibilityLabel={`${n} star${n === 1 ? "" : "s"}`}
            hitSlop={6}
          >
            <Text style={{ fontSize: size, color: on ? colors.accent : colors.line }}>{on ? FILLED : EMPTY}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Compact "4.4 ★★★★☆ (128)" used in search results and headers.
 *
 * With no reviews it says so in words rather than rendering five empty stars,
 * which reads as a one-star business rather than an unrated one.
 */
export function RatingBadge({ rating, size = 14, style }) {
  const count = rating?.count || 0;
  if (!count) {
    return <Text style={[{ fontSize: 12, color: colors.faint }, style]}>No reviews yet</Text>;
  }
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 6 }, style]}>
      <Text style={{ fontSize: size, fontWeight: "700", color: colors.ink }}>{rating.average.toFixed(1)}</Text>
      <Stars value={rating.average} size={size} />
      <Text style={{ fontSize: 12, color: colors.faint }}>({count})</Text>
    </View>
  );
}

/** The 5-to-1 histogram, as proportional bars. */
export function RatingHistogram({ rating, onSelectRating, selectedRating }) {
  const total = rating?.count || 0;
  const dist = rating?.distribution || {};
  return (
    <View style={{ gap: 4 }}>
      {[5, 4, 3, 2, 1].map((n) => {
        const value = dist[n] || 0;
        const pct = total > 0 ? (value / total) * 100 : 0;
        const active = selectedRating === n;
        return (
          <Pressable
            key={n}
            onPress={onSelectRating ? () => onSelectRating(active ? null : n) : undefined}
            disabled={!onSelectRating || value === 0}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
          >
            <Text style={{ fontSize: 12, color: active ? colors.ink : colors.muted, width: 12, fontWeight: active ? "700" : "400" }}>
              {n}
            </Text>
            <View style={{ flex: 1, minWidth: 0, height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: "hidden" }}>
              <View style={{ width: `${pct}%`, height: "100%", backgroundColor: active ? colors.primary : colors.accent }} />
            </View>
            <Text style={{ fontSize: 11, color: colors.faint, width: 28, textAlign: "right" }}>{value}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
