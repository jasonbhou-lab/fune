import React, { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { PrimaryButton, Banner, Card, Wordmark } from "../../components/ui";
import OrgPicker from "../../components/OrgPicker";
import { useAppState, SELF_SERVICE_ACCOUNT_TYPES } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";
import { useContentWidth } from "../../responsive";

/**
 * The account-type question for people who never saw the signup form.
 *
 * "Continue with Google" hands Supabase a verified identity and nothing else,
 * so handle_new_user() has no account type to work from. It falls back to
 * consumer, which is the right safe default but the wrong answer for a funeral
 * home: they would land in the consumer app with no route to the portal and no
 * way to correct it. So the navigator holds them here first.
 *
 * Deliberately offers no way past it other than answering or signing out. The
 * choice decides which half of the product the account belongs to and it can
 * only be made once, so a "skip" would just be a silent consumer default with
 * extra steps.
 */
export default function ChooseRoleScreen() {
  const { claimAccountType, logout, user } = useAppState();
  const contentWidth = useContentWidth();

  const [accountType, setAccountType] = useState(null);
  const [orgClaim, setOrgClaim] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const onGradient = { color: colors.primaryInk };
  const onGradientMuted = { color: "rgba(255,255,255,0.8)" };
  const fieldLabelColor = "rgba(255,255,255,0.85)";

  const submit = async () => {
    setError(null);
    if (!accountType) {
      setError("Choose which describes you to finish setting up your account.");
      return;
    }
    if (accountType === "provider" && !orgClaim?.orgId && !orgClaim?.orgName) {
      setError("Choose your organization, or enter its name if it isn't listed.");
      return;
    }
    setLoading(true);
    try {
      // On success the profile is refetched, role_pending clears, and the
      // navigator swaps this screen for the area matching the new role.
      await claimAccountType(accountType, orgClaim);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[colors.primary, colors.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[{ flexGrow: 1, padding: spacing.lg, paddingTop: spacing.xxl, width: "100%" }, contentWidth]}
        keyboardShouldPersistTaps="handled"
      >
        <Wordmark onDark style={{ marginBottom: spacing.xl }} />

        <Text style={[type.h2, onGradient, { marginBottom: spacing.md }]}>One more thing</Text>
        {error ? <Banner tone="danger">{error}</Banner> : null}

        <Text style={[type.caption, onGradientMuted, { marginBottom: spacing.md, fontSize: 13, lineHeight: 19 }]}>
          {user?.name ? `Welcome, ${user.name}. ` : ""}
          Signing in with Google confirmed who you are, but not what you're here for. Tell us which one you are and we'll
          take you to the right place.
        </Text>

        <Text style={[type.label, onGradientMuted, { marginBottom: spacing.sm }]}>Which describes you? (required)</Text>
        {SELF_SERVICE_ACCOUNT_TYPES.map((opt) => {
          const active = accountType === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => {
                setAccountType(opt.id);
                if (opt.id !== "provider") setOrgClaim(null);
                if (!accountType) setError(null);
              }}
              style={{
                borderWidth: active ? 2 : 1,
                borderColor: active ? colors.primaryInk : "rgba(255,255,255,0.45)",
                backgroundColor: active ? "rgba(255,255,255,0.18)" : "transparent",
                borderRadius: 10,
                padding: 12,
                marginBottom: spacing.sm,
              }}
            >
              <Text style={[onGradient, { fontWeight: active ? "700" : "500" }]}>
                {active ? "● " : "○ "}
                {opt.label}
              </Text>
            </Pressable>
          );
        })}

        {accountType === "provider" ? (
          <View style={{ marginTop: spacing.sm }}>
            <OrgPicker
              value={orgClaim}
              onChange={(next) => {
                setOrgClaim(next);
                setError(null);
              }}
              labelColor={fieldLabelColor}
              onGradientMuted={onGradientMuted}
            />
          </View>
        ) : null}

        <Card style={{ marginTop: spacing.sm, marginBottom: spacing.md }}>
          <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>
            This sets what your account is for, and it's asked once. Providers get the listing portal; everyone else gets
            search and comparison. If you pick the wrong one, an administrator has to change it for you.
          </Text>
        </Card>

        <PrimaryButton title="Continue" onPress={submit} loading={loading} style={{ backgroundColor: colors.ink }} />

        <Pressable onPress={logout} style={{ marginTop: spacing.lg }}>
          <Text style={[onGradientMuted, { textAlign: "center", fontSize: 12 }]}>Sign out instead</Text>
        </Pressable>
      </ScrollView>
    </LinearGradient>
  );
}
