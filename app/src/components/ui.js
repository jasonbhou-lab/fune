import React from "react";
import { View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator } from "react-native";
import { colors, spacing } from "../theme";
import { useContentWidth } from "../responsive";

// react-navigation's native-stack renders each screen as a viewport-fixed
// overlay on web (a react-native-screens quirk that ignores any width
// constraint applied above it), so the "narrow, centered on web" layout has
// to be applied inside each screen's own content rather than around the
// navigator. This outer/inner split gives every Screen user that for free:
// the outer view fills the real (full-viewport) box react-navigation hands
// it, and the inner one is the actual constrained, centered column.
export function Screen({ children, style }) {
  // null on native and on phone-width web, where content should use the full
  // width rather than being squeezed into a half-width column.
  const contentWidth = useContentWidth();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[{ flex: 1, width: "100%", padding: spacing.lg }, contentWidth, style]}>{children}</View>
    </View>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * A label-on-the-left, value-on-the-right row.
 *
 * Nearly every list and detail screen in the portal and admin areas hand-rolled
 * this as `flexDirection: "row", justifyContent: "space-between"` with a bare
 * <Text> on the left. That looks right until the left text is long — a category
 * key, an offering name, an activity label — at which point flexbox shrinks
 * whichever side it likes: the count gets pushed off, or a fixed-size control
 * like a toggle is squashed below its own width. It only shows up on a narrow
 * viewport, so it was invisible on a desktop browser.
 *
 * Encoding it once means every screen behaves the same at every width:
 *  - the left side takes the remaining space and wraps within it. minWidth: 0
 *    is required on web, where a flex child otherwise refuses to shrink below
 *    its content's intrinsic width and overflows the row instead of wrapping;
 *  - the right side never shrinks, so badges, prices, and toggles keep their
 *    natural size.
 */
export function SplitRow({ left, right, style, align = "center", gap = spacing.sm }) {
  return (
    <View style={[{ flexDirection: "row", alignItems: align, gap }, style]}>
      <View style={{ flex: 1, minWidth: 0 }}>{left}</View>
      {right != null ? <View style={{ flexShrink: 0 }}>{right}</View> : null}
    </View>
  );
}

export function PrimaryButton({ title, onPress, disabled, loading, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: colors.primary, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={colors.primaryInk} /> : <Text style={styles.btnTextPrimary}>{title}</Text>}
    </Pressable>
  );
}

export function SecondaryButton({ title, onPress, disabled, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, styles.btnSecondary, { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }, style]}
    >
      <Text style={styles.btnTextSecondary}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = "ok" }) {
  const toneMap = {
    ok: [colors.okSoft, colors.ok],
    warn: [colors.warnSoft, colors.warn],
    danger: [colors.dangerSoft, colors.danger],
  };
  const [bg, fg] = toneMap[tone] || toneMap.ok;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function TextField({ label, value, onChangeText, placeholder, error, keyboardType, secureTextEntry, autoCapitalize, multiline, numberOfLines, labelColor }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[styles.fieldLabel, labelColor && { color: labelColor }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize || "none"}
        multiline={multiline}
        numberOfLines={numberOfLines}
        style={[styles.input, multiline && { minHeight: 22 * (numberOfLines || 4), textAlignVertical: "top" }, error && { borderColor: colors.danger }]}
        placeholderTextColor={colors.faint}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function Banner({ children, tone = "warn" }) {
  const toneMap = { warn: [colors.warnSoft, colors.warn], danger: [colors.dangerSoft, colors.danger] };
  const [bg, fg] = toneMap[tone] || toneMap.warn;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, lineHeight: 17 }}>{children}</Text>
    </View>
  );
}

export function CheckboxRow({ label, checked, onToggle }) {
  return (
    <Pressable onPress={onToggle} style={styles.checkboxRow}>
      <View style={[styles.checkbox, checked && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
        {checked ? <Text style={{ color: colors.primaryInk, fontSize: 11, fontWeight: "700" }}>✓</Text> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.bgCard,
    padding: spacing.md,
  },
  btn: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondary: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.line },
  btnTextPrimary: { color: colors.primaryInk, fontWeight: "700", fontSize: 14 },
  btnTextSecondary: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 6,
    backgroundColor: colors.bgCard,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: colors.primaryInk },
  // flexShrink: 0 so a badge sitting beside a long label keeps its size instead
  // of being compressed until its own text wraps mid-word.
  badge: { borderRadius: 20, paddingVertical: 3, paddingHorizontal: 8, alignSelf: "flex-start", flexShrink: 0 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  fieldLabel: { ...{ fontSize: 11, color: colors.faint, textTransform: "uppercase", letterSpacing: 0.5 }, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.bgCard,
  },
  errorText: { color: colors.danger, fontSize: 11, marginTop: 4 },
  banner: { borderRadius: 10, padding: 10, marginVertical: spacing.sm },
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.sm },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.line,
    marginRight: 8,
    marginTop: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxLabel: { flex: 1, fontSize: 12, color: colors.muted },
});
