import React from "react";
import { View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator } from "react-native";
import { colors, spacing } from "../theme";

export function Screen({ children, style }) {
  return <View style={[{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }, style]}>{children}</View>;
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
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

export function TextField({ label, value, onChangeText, placeholder, error, keyboardType, secureTextEntry, autoCapitalize, multiline, numberOfLines }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
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
  badge: { borderRadius: 20, paddingVertical: 3, paddingHorizontal: 8, alignSelf: "flex-start" },
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
