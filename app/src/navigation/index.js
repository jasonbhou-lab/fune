import React from "react";
import { Text, View, ActivityIndicator } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { colors } from "../theme";
import { useAppState } from "../context/AppState";

import WelcomeScreen from "../screens/consumer/WelcomeScreen";
import CategoriesScreen from "../screens/consumer/CategoriesScreen";
import FiltersScreen from "../screens/consumer/FiltersScreen";
import SearchResultsScreen from "../screens/consumer/SearchResultsScreen";
import OfferDetailScreen from "../screens/consumer/OfferDetailScreen";
import CompareScreen from "../screens/consumer/CompareScreen";
import LeadFormScreen from "../screens/consumer/LeadFormScreen";
import ConfirmationScreen from "../screens/consumer/ConfirmationScreen";
import SavedScreen from "../screens/consumer/SavedScreen";
import HistoryScreen from "../screens/consumer/HistoryScreen";
import AccountScreen from "../screens/consumer/AccountScreen";
import SignInScreen from "../screens/consumer/SignInScreen";
import ChooseRoleScreen from "../screens/consumer/ChooseRoleScreen";
import CommPrefsScreen from "../screens/consumer/CommPrefsScreen";

import PortalHomeScreen from "../screens/portal/PortalHomeScreen";

import AdminHomeScreen from "../screens/admin/AdminHomeScreen";

const RootStack = createNativeStackNavigator();
const SearchStack = createNativeStackNavigator();
const SavedStack = createNativeStackNavigator();
const HistoryStack = createNativeStackNavigator();
const AccountStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const stackOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerShadowVisible: false,
  headerTitleStyle: { color: colors.ink, fontWeight: "700" },
  headerTintColor: colors.primary,
  contentStyle: { backgroundColor: colors.bg },
};

function SearchStackNavigator() {
  return (
    <SearchStack.Navigator initialRouteName="Welcome" screenOptions={stackOptions}>
      <SearchStack.Screen name="Welcome" component={WelcomeScreen} options={{ title: "GLP" }} />
      <SearchStack.Screen name="Categories" component={CategoriesScreen} options={{ title: "Browse by category" }} />
      <SearchStack.Screen name="Results" component={SearchResultsScreen} options={{ title: "Search results" }} />
      <SearchStack.Screen name="Filters" component={FiltersScreen} options={{ title: "Filters" }} />
      <SearchStack.Screen name="OfferDetail" component={OfferDetailScreen} options={{ title: "Offer detail" }} />
      <SearchStack.Screen name="Compare" component={CompareScreen} options={{ title: "Compare" }} />
      <SearchStack.Screen name="LeadForm" component={LeadFormScreen} options={{ title: "Request pricing" }} />
      <SearchStack.Screen name="Confirmation" component={ConfirmationScreen} options={{ title: "Request sent", headerBackVisible: false }} />
    </SearchStack.Navigator>
  );
}

function SavedStackNavigator() {
  return (
    <SavedStack.Navigator screenOptions={stackOptions}>
      <SavedStack.Screen name="Saved" component={SavedScreen} options={{ title: "Saved" }} />
      <SavedStack.Screen name="OfferDetail" component={OfferDetailScreen} options={{ title: "Offer detail" }} />
      <SavedStack.Screen name="Compare" component={CompareScreen} options={{ title: "Compare" }} />
      <SavedStack.Screen name="LeadForm" component={LeadFormScreen} options={{ title: "Request pricing" }} />
      <SavedStack.Screen name="Confirmation" component={ConfirmationScreen} options={{ title: "Request sent", headerBackVisible: false }} />
    </SavedStack.Navigator>
  );
}

function HistoryStackNavigator() {
  return (
    <HistoryStack.Navigator screenOptions={stackOptions}>
      <HistoryStack.Screen name="History" component={HistoryScreen} options={{ title: "My requests" }} />
    </HistoryStack.Navigator>
  );
}

function AccountStackNavigator() {
  return (
    <AccountStack.Navigator screenOptions={stackOptions}>
      <AccountStack.Screen name="Account" component={AccountScreen} options={{ title: "Account" }} />
      <AccountStack.Screen name="CommPrefs" component={CommPrefsScreen} options={{ title: "Communication" }} />
    </AccountStack.Navigator>
  );
}

function icon(symbol) {
  return ({ color }) => <Text style={{ color, fontSize: 18 }}>{symbol}</Text>;
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { backgroundColor: colors.bgCard, borderTopColor: colors.line },
      }}
    >
      <Tabs.Screen name="SearchTab" component={SearchStackNavigator} options={{ title: "Search", tabBarIcon: icon("🔍") }} />
      <Tabs.Screen name="SavedTab" component={SavedStackNavigator} options={{ title: "Saved", tabBarIcon: icon("♡") }} />
      <Tabs.Screen name="HistoryTab" component={HistoryStackNavigator} options={{ title: "History", tabBarIcon: icon("🕐") }} />
      <Tabs.Screen name="AccountTab" component={AccountStackNavigator} options={{ title: "Account", tabBarIcon: icon("👤") }} />
    </Tabs.Navigator>
  );
}

export default function RootNavigator() {
  const { session, role, rolePending, authLoading, passwordRecovery } = useAppState();

  if (authLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // There is one login form, so the account's role — not which screen they came
  // through — decides where they land.
  //
  // A password-recovery link signs the user in before they have chosen a new
  // password, so the gate stays up in that case regardless of role, or they
  // would be routed into the app and never see the reset form.
  //
  // A session with no profile yet resolved also stays on the gate: routing on a
  // null role would briefly show the consumer app to a provider or admin.
  const signedIn = Boolean(session) && !passwordRecovery && Boolean(role);

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!signedIn ? (
          <RootStack.Screen name="SignIn" component={SignInScreen} />
        ) : rolePending ? (
          // Signed in, but the account type was never asked for — every Google
          // signup. Routing on the fallback role would drop a funeral home into
          // the consumer app with no way back, so ask before going anywhere.
          <RootStack.Screen name="ChooseRole" component={ChooseRoleScreen} />
        ) : role === "platform_admin" ? (
          <RootStack.Screen name="AdminHome" component={AdminHomeScreen} />
        ) : role === "provider" ? (
          <RootStack.Screen name="PortalHome" component={PortalHomeScreen} />
        ) : (
          <RootStack.Screen name="Main" component={MainTabs} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
