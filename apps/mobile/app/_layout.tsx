import "../global.css";
import { useEffect, useRef, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
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
import { isAppOnboardingComplete, onboardingVersion } from "../lib/onboarding";

function RootLayoutNav() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colors = useThemeColors();
  const lastRedirectRef = useRef<string | null>(null);
  const firstSegment = String(segments[0] || "");
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
      const isComplete = await isAppOnboardingComplete(user.id, onboardingVersion);
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
  }, [user?.id]);

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

    const inAuthGroup = firstSegment === "(auth)";
    const inAuthCallback = firstSegment === "auth"; // orbit://auth/callback deep link route
    const inOnboardingGroup = firstSegment === "(onboarding)";
    const inOnboardingWelcome = firstSegment === "welcome";
    const inGoogleImportScreen = firstSegment === "google-import";
    const inIncomingCallScreen = firstSegment === "incoming-call";
    const inOnboardingFlow =
      inOnboardingGroup || inOnboardingWelcome || inGoogleImportScreen;

    let redirectTarget: "/(auth)/sign-in" | "/welcome" | "/(tabs)/assistant" | null =
      null;

    if (!user?.id && !inAuthGroup && !inAuthCallback) {
      // Redirect to sign-in if not authenticated
      // (don't redirect away from auth/callback while OAuth code exchange is in progress)
      redirectTarget = "/(auth)/sign-in";
    } else if (
      user?.id &&
      onboardingState === "required" &&
      !inOnboardingFlow &&
      !inIncomingCallScreen
    ) {
      redirectTarget = "/welcome";
    } else if (
      user?.id &&
      onboardingState === "complete" &&
      (inAuthGroup || inAuthCallback || inOnboardingGroup || inOnboardingWelcome)
    ) {
      // Redirect to assistant if authenticated
      redirectTarget = "/(tabs)/assistant";
    }

    if (!redirectTarget) {
      lastRedirectRef.current = null;
      return;
    }

    // Prevent repeated replace calls while React Navigation is settling route changes.
    if (lastRedirectRef.current === redirectTarget) {
      return;
    }
    lastRedirectRef.current = redirectTarget;
    router.replace(redirectTarget as any);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, firstSegment, isLoading, onboardingState]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background-0">
        <ActivityIndicator size="large" color={getThemeColor(colors, "primary-600")} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false, animation: "none" }} />;
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
