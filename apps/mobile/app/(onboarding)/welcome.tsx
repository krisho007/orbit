import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Download, Sparkles } from "lucide-react-native";
import { useAuth } from "../../lib/auth";
import { markGoogleImportOnboardingComplete } from "../../lib/onboarding";
import { getThemeColor, useThemeColors } from "../../lib/theme";

export default function WelcomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const colors = useThemeColors();
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completeOnboarding = async () => {
    if (!user?.id) {
      router.replace("/(tabs)/assistant");
      return;
    }

    setIsFinishing(true);
    setError(null);
    try {
      await markGoogleImportOnboardingComplete(user.id);
      router.replace("/(tabs)/assistant");
    } catch (err) {
      console.error("Failed to complete onboarding:", err);
      setError("Could not continue. Please try again.");
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background-50">
      <View className="flex-1 px-6 py-8 justify-between">
        <View>
          <View className="w-16 h-16 rounded-3xl bg-primary-600 items-center justify-center mb-6">
            <Sparkles size={28} color={getThemeColor(colors, "typography-0")} />
          </View>
          <Text className="text-typography-900 text-3xl font-bold mb-3">
            Welcome to Orbit
          </Text>
          <Text className="text-typography-600 text-base leading-6">
            Start with your Google contacts so your CRM is useful from day one.
          </Text>
        </View>

        <View className="bg-background-0 border border-border-200 rounded-2xl p-5">
          <View className="flex-row items-start">
            <View className="w-11 h-11 rounded-2xl bg-primary-100 items-center justify-center mr-3 mt-1">
              <Download size={20} color={getThemeColor(colors, "primary-600")} />
            </View>
            <View className="flex-1">
              <Text className="text-typography-900 text-lg font-semibold mb-1">
                Import from Google
              </Text>
              <Text className="text-typography-600 text-sm leading-5">
                We will check duplicates by primary phone and keep the more detailed name.
              </Text>
            </View>
          </View>
        </View>

        <View>
          {error && (
            <View className="mb-4 p-3 bg-background-error border border-error-100 rounded-xl">
              <Text className="text-error-600 text-center">{error}</Text>
            </View>
          )}
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/google-import" as any,
                params: { entry: "onboarding" },
              })
            }
            disabled={isFinishing}
            className="w-full py-4 rounded-2xl bg-primary-600 items-center mb-3"
            style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
          >
            <Text className="text-typography-0 text-base font-semibold">
              Import from Google
            </Text>
          </Pressable>

          <Pressable
            onPress={completeOnboarding}
            disabled={isFinishing}
            className="w-full py-4 rounded-2xl bg-background-0 border border-border-200 items-center"
            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
          >
            {isFinishing ? (
              <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
            ) : (
              <Text className="text-typography-700 text-base font-semibold">Skip for now</Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
