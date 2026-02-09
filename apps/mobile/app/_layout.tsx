import "../global.css";
import { useEffect, useState } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../lib/auth";
import { View, ActivityIndicator, PermissionsAndroid, Platform } from "react-native";
import {
  GluestackUIProvider,
  useGluestackUI,
} from "../components/ui/gluestack-ui-provider";
import { getThemeColor, ThemeModeProvider, useThemeColors, useThemeMode } from "../lib/theme";
import { isGoogleImportOnboardingComplete } from "../lib/onboarding";

function RootLayoutNav() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colors = useThemeColors();
  const [onboardingState, setOnboardingState] = useState<
    "checking" | "required" | "complete"
  >("checking");

  useEffect(() => {
    let cancelled = false;

    const loadOnboardingState = async () => {
      if (!user?.id) {
        if (!cancelled) setOnboardingState("complete");
        return;
      }

      if (!cancelled) setOnboardingState("checking");
      const isComplete = await isGoogleImportOnboardingComplete(user.id);
      if (!cancelled) {
        setOnboardingState(isComplete ? "complete" : "required");
      }
    };

    loadOnboardingState().catch((error) => {
      console.error("Failed to load onboarding state:", error);
      if (!cancelled) setOnboardingState("required");
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, segments[0]]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const requestAndroidPermissions = async () => {
      try {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE);
        if (typeof Platform.Version === "number" && Platform.Version >= 33) {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        }
      } catch (error) {
        console.error("Failed to request Android permissions:", error);
      }
    };

    requestAndroidPermissions();
  }, []);

  useEffect(() => {
    if (isLoading || onboardingState === "checking") return;

    const firstSegment = String(segments[0] || "");
    const inAuthGroup = firstSegment === "(auth)";
    const inOnboardingWelcome = firstSegment === "welcome";
    const inGoogleImportScreen = firstSegment === "google-import";
    const inIncomingCallScreen = firstSegment === "incoming-call";
    const inTabsGroup = firstSegment === "(tabs)";
    const inOnboardingFlow = inOnboardingWelcome || inGoogleImportScreen;

    if (!user?.id && !inAuthGroup) {
      // Redirect to sign-in if not authenticated
      router.replace("/(auth)/sign-in");
    } else if (
      user?.id &&
      onboardingState === "required" &&
      !inOnboardingFlow &&
      !inIncomingCallScreen &&
      !inTabsGroup
    ) {
      router.replace("/welcome" as any);
    } else if (user?.id && onboardingState === "complete" && (inAuthGroup || inOnboardingWelcome)) {
      // Redirect to assistant if authenticated
      router.replace("/(tabs)/assistant");
    }
  }, [user?.id, segments, isLoading, onboardingState, router]);

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
