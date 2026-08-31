import React, { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Screen, ScrollScreen, TextField, PrimaryButton, SecondaryButton, Wordmark } from "../../components/ui";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

const NEED_OPTIONS = [
  { id: "immediate_need", label: "Immediate need", icon: "🕊" },
  { id: "planning_ahead", label: "Planning ahead", icon: "🗓" },
  { id: "research", label: "Just researching", icon: "🔍" },
];

export default function WelcomeScreen({ navigation }) {
  const { location, setLocation, needType, setNeedType } = useAppState();
  const [zip, setZip] = useState(location.zip);

  const submit = () => {
    setLocation({ ...location, zip: zip || location.zip });
    navigation.navigate("Results", {});
  };

  return (
    <ScrollScreen contentStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Wordmark style={{ marginBottom: spacing.xl }} />

        <TextField label="ZIP or city" value={zip} onChangeText={setZip} placeholder="77494" keyboardType="number-pad" />

        <Text style={[type.label, { marginBottom: spacing.sm }]}>What brings you here today?</Text>
        {NEED_OPTIONS.map((opt) => {
          const active = needType === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => setNeedType(opt.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                borderWidth: active ? 2 : 1,
                borderColor: active ? colors.accent : colors.line,
                backgroundColor: active ? colors.accentSoft : colors.bgCard,
                borderRadius: 16,
                padding: 12,
                marginBottom: spacing.sm,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: active ? colors.bgCard : colors.sageSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 16 }}>{opt.icon}</Text>
              </View>
              <Text style={{ color: active ? colors.navy : colors.muted, fontWeight: active ? "700" : "500", fontSize: 14 }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}

        <View style={{ flex: 1 }} />

        <PrimaryButton title="Find providers" onPress={submit} style={{ marginTop: spacing.lg }} />
        <SecondaryButton title="Browse by category" onPress={() => navigation.navigate("Categories")} style={{ marginTop: spacing.sm }} />
        <Text style={[type.caption, { textAlign: "center", marginTop: spacing.md }]}>
          No obligation to contact anyone.
        </Text>
    </ScrollScreen>
  );
}
