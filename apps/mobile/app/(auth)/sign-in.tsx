import { View, Text, Pressable, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth";
import { useState } from "react";
import { Users, MessageCircle, CalendarDays } from "lucide-react-native";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { HuskyLogo } from "../../components/HuskyLogo";

const PRIVACY_POLICY_URL = "https://www.myorbit360.com/privacy";
const TERMS_URL = "https://www.myorbit360.com/terms";

export default function SignIn() {
  const { signInWithGoogle } = useAuth();
  const colors = useThemeColors();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await signInWithGoogle();
    } catch (err) {
      setError("Failed to sign in. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background-50">
      <View className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-primary-100" />
      <View className="absolute -bottom-20 -left-16 w-56 h-56 rounded-full bg-secondary-100" />

      <View className="flex-1 justify-center items-center px-8">
        <View className="mb-10 items-center">
          <HuskyLogo size={120} color={getThemeColor(colors, "primary-700")} />
          <Text className="text-4xl font-heading-bold text-typography-900 mt-4 mb-2">
            Orbit
          </Text>
          <Text className="text-lg text-typography-600 text-center">
            Your personal CRM for real relationships
          </Text>
        </View>

        <View className="mb-10 w-full">
          <View className="flex-row items-center mb-4">
            <View className="w-10 h-10 bg-primary-100 rounded-2xl items-center justify-center mr-4">
              <Users size={18} color={getThemeColor(colors, "primary-600")} />
            </View>
            <Text className="text-typography-700 flex-1">
              Keep your network organized and warm
            </Text>
          </View>
          <View className="flex-row items-center mb-4">
            <View className="w-10 h-10 bg-primary-100 rounded-2xl items-center justify-center mr-4">
              <MessageCircle size={18} color={getThemeColor(colors, "primary-600")} />
            </View>
            <Text className="text-typography-700 flex-1">
              Capture conversations and follow-ups
            </Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-10 h-10 bg-primary-100 rounded-2xl items-center justify-center mr-4">
              <CalendarDays size={18} color={getThemeColor(colors, "primary-600")} />
            </View>
            <Text className="text-typography-700 flex-1">
              Track important moments effortlessly
            </Text>
          </View>
        </View>

        {error && (
          <View className="w-full mb-4 p-4 bg-background-error rounded-xl border border-error-100">
            <Text className="text-error-600 text-center">{error}</Text>
          </View>
        )}

        <Pressable
          onPress={handleGoogleSignIn}
          disabled={isLoading}
          className={`w-full flex-row items-center justify-center py-4 px-6 rounded-2xl shadow-sm ${
            isLoading ? "bg-background-100" : "bg-background-0 border border-border-200"
          }`}
          style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
        >
          {!isLoading && (
            <View className="w-8 h-8 mr-3 rounded-full bg-secondary-100 items-center justify-center">
              <Text className="text-secondary-700 font-body-semibold">G</Text>
            </View>
          )}
          <Text
            className={`text-lg font-body-semibold ${
              isLoading ? "text-typography-400" : "text-typography-700"
            }`}
          >
            {isLoading ? "Signing in..." : "Continue with Google"}
          </Text>
        </Pressable>

        <Text className="text-typography-400 text-sm text-center mt-8 px-4">
          By continuing, you agree to our{" "}
          <Text
            className="text-primary-600 underline"
            onPress={() => Linking.openURL(TERMS_URL)}
          >
            Terms of Service
          </Text>
          {" "}and{" "}
          <Text
            className="text-primary-600 underline"
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
          >
            Privacy Policy
          </Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}
