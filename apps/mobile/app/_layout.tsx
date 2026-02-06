import "../global.css";
import { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../lib/auth";
import { View, ActivityIndicator } from "react-native";
import {
  GluestackUIProvider,
  useGluestackUI,
} from "../components/ui/gluestack-ui-provider";
import { getThemeColor, ThemeModeProvider, useThemeColors, useThemeMode } from "../lib/theme";

function RootLayoutNav() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colors = useThemeColors();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!user && !inAuthGroup) {
      // Redirect to sign-in if not authenticated
      router.replace("/(auth)/sign-in");
    } else if (user && inAuthGroup) {
      // Redirect to home if authenticated
      router.replace("/(tabs)");
    }
  }, [user, segments, isLoading]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background-0">
        <ActivityIndicator size="large" color={getThemeColor(colors, "primary-600")} />
      </View>
    );
  }

  return <Slot />;
}

function ThemedStatusBar() {
  const { resolvedColorMode } = useGluestackUI();
  return <StatusBar style={resolvedColorMode === "dark" ? "light" : "dark"} />;
}

function AppShell() {
  const { mode, isReady } = useThemeMode();

  if (!isReady) {
    return (
      <View className="flex-1 items-center justify-center bg-background-0">
        <ActivityIndicator size="large" color="#0D9488" />
      </View>
    );
  }

  return (
    <GluestackUIProvider mode={mode}>
      <AuthProvider>
        <ThemedStatusBar />
        <RootLayoutNav />
      </AuthProvider>
    </GluestackUIProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeModeProvider>
          <AppShell />
        </ThemeModeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
