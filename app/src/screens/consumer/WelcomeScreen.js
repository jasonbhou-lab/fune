import React, { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Screen, TextField, PrimaryButton, SecondaryButton } from "../../components/ui";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

const NEED_OPTIONS = [
  { id: "immediate_need", label: "Immediate need" },
  { id: "planning_ahead", label: "Planning ahead" },
  { id: "research", label: "Just researching" },
];

export default function WelcomeScreen({ navigation }) {
  const { location, setLocation, needType, setNeedType } = useAppState();
  const [zip, setZip] = useState(location.zip);

  const submit = () => {
    setLocation({ ...location, zip: zip || location.zip });
    navigation.navigate("Results", {});
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Text style={type.display}>FuneralPrice Compare</Text>
        <Text style={[type.caption, { marginTop: 4, marginBottom: spacing.xl }]}>Compare with clarity.</Text>

        <TextField label="ZIP or city" value={zip} onChangeText={setZip} placeholder="77494" keyboardType="number-pad" />

        <Text style={[type.label, { marginBottom: spacing.sm }]}>What brings you here today?</Text>
        {NEED_OPTIONS.map((opt) => (
          <Pressable
            key={opt.id}
            onPress={() => setNeedType(opt.id)}
            style={{
              borderWidth: 1,
              borderColor: needType === opt.id ? colors.accent : colors.line,
              backgroundColor: needType === opt.id ? colors.accentSoft : colors.bgCard,
              borderRadius: 10,
              padding: 12,
              marginBottom: spacing.sm,
            }}
          >
            <Text style={{ color: needType === opt.id ? colors.accent : colors.muted, fontWeight: needType === opt.id ? "700" : "500" }}>
              {opt.label}
            </Text>
          </Pressable>
        ))}

        <View style={{ flex: 1 }} />

        <PrimaryButton title="Find providers" onPress={submit} style={{ marginTop: spacing.lg }} />
        <SecondaryButton title="Browse by category" onPress={() => navigation.navigate("Categories")} style={{ marginTop: spacing.sm }} />
        <Text style={[type.caption, { textAlign: "center", marginTop: spacing.md }]}>
          No obligation to contact anyone.
        </Text>
      </ScrollView>
    </Screen>
  );
}
