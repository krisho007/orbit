import { View, Text, Pressable, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth";
import { useState } from "react";

export default function SignIn() {
  const { signInWithGoogle } = useAuth();
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
    <SafeAreaView className="flex-1 bg-gradient-to-b from-primary-50 to-white">
      <View className="flex-1 justify-center items-center px-8">
        {/* Logo/Brand */}
        <View className="mb-12 items-center">
          <View className="w-24 h-24 bg-primary-600 rounded-3xl items-center justify-center mb-6 shadow-lg">
            <Text className="text-white text-4xl font-bold">O</Text>
          </View>
          <Text className="text-4xl font-bold text-gray-900 mb-2">Orbit</Text>
          <Text className="text-lg text-gray-500 text-center">
            Your Personal CRM
          </Text>
        </View>

        {/* Features */}
        <View className="mb-12 w-full">
          <View className="flex-row items-center mb-4">
            <View className="w-10 h-10 bg-primary-100 rounded-full items-center justify-center mr-4">
              <Text className="text-primary-600">👥</Text>
            </View>
            <Text className="text-gray-700 flex-1">
              Manage your contacts effectively
            </Text>
          </View>
          <View className="flex-row items-center mb-4">
            <View className="w-10 h-10 bg-primary-100 rounded-full items-center justify-center mr-4">
              <Text className="text-primary-600">💬</Text>
            </View>
            <Text className="text-gray-700 flex-1">
              Track conversations and follow-ups
            </Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-10 h-10 bg-primary-100 rounded-full items-center justify-center mr-4">
              <Text className="text-primary-600">📅</Text>
            </View>
            <Text className="text-gray-700 flex-1">
              Never miss important events
            </Text>
          </View>
        </View>

        {/* Error Message */}
        {error && (
          <View className="w-full mb-4 p-4 bg-red-50 rounded-lg">
            <Text className="text-red-600 text-center">{error}</Text>
          </View>
        )}

        {/* Sign In Button */}
        <Pressable
          onPress={handleGoogleSignIn}
          disabled={isLoading}
          className={`w-full flex-row items-center justify-center py-4 px-6 rounded-xl shadow-sm ${
            isLoading ? "bg-gray-100" : "bg-white border border-gray-200"
          }`}
          style={({ pressed }) => [
            { opacity: pressed ? 0.8 : 1 },
          ]}
        >
          {!isLoading && (
            <View className="w-6 h-6 mr-3">
              <Text className="text-xl">🔵</Text>
            </View>
          )}
          <Text
            className={`text-lg font-semibold ${
              isLoading ? "text-gray-400" : "text-gray-700"
            }`}
          >
            {isLoading ? "Signing in..." : "Continue with Google"}
          </Text>
        </Pressable>

        {/* Terms */}
        <Text className="text-gray-400 text-sm text-center mt-8 px-4">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  );
}
