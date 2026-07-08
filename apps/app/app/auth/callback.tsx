import { View, ActivityIndicator, Text } from "react-native";
import { useThemeColors, getThemeColor } from "../../lib/theme";

/**
 * This screen exists solely as a landing route for the OAuth callback deep link
 * (orbit://auth/callback). The actual auth code exchange is handled by the
 * deep link listener in lib/auth.tsx. Once the session is established,
 * the root _layout.tsx redirect logic navigates the user away from here.
 */
export default function AuthCallbackScreen() {
  const colors = useThemeColors();

  return (
    <View className="flex-1 items-center justify-center bg-background-0">
      <ActivityIndicator
        size="large"
        color={getThemeColor(colors, "primary-600")}
      />
      <Text className="mt-4 text-typography-500">Completing sign in...</Text>
    </View>
  );
}
