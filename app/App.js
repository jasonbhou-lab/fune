import "react-native-gesture-handler";
import React from "react";
import { View, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, PlayfairDisplay_600SemiBold, PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display";
import { AppStateProvider } from "./src/context/AppState";
import RootNavigator from "./src/navigation";
import Toast from "./src/components/Toast";
import { colors } from "./src/theme";

export default function App() {
  // theme.js styles headings with these two weights (see `fonts`). Until they
  // load, any screen rendering type.display/h2 would fall back to the
  // platform default and then visibly swap to serif a moment later — worse
  // than a brief blank frame, so the whole app waits behind this gate.
  const [fontsLoaded] = useFonts({ PlayfairDisplay_600SemiBold, PlayfairDisplay_700Bold });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <RootNavigator />
        <Toast />
        <StatusBar style="auto" />
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
