import "react-native-gesture-handler";
import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppStateProvider } from "./src/context/AppState";
import RootNavigator from "./src/navigation";
import Toast from "./src/components/Toast";

export default function App() {
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
