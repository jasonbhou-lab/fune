import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useAppState } from "../context/AppState";
import { colors } from "../theme";

export default function Toast() {
  const { toast } = useAppState();
  const [visible, setVisible] = useState(null);

  useEffect(() => {
    if (!toast) return;
    setVisible(toast);
    const t = setTimeout(() => setVisible(null), 3000);
    return () => clearTimeout(t);
  }, [toast?.key]);

  if (!visible) return null;

  const toneColors = {
    ok: [colors.primary, colors.primaryInk],
    danger: [colors.danger, "#FFFFFF"],
  };
  const [bg, fg] = toneColors[visible.tone] || toneColors.ok;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: 76,
        alignItems: "center",
        zIndex: 999,
      }}
    >
      <View style={{ backgroundColor: bg, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, maxWidth: 420 }}>
        <Text style={{ color: fg, fontWeight: "600", fontSize: 13, textAlign: "center" }}>{visible.message}</Text>
      </View>
    </View>
  );
}
