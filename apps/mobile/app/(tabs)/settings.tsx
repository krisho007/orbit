import { View, Text, Pressable, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth";
import { useRouter } from "expo-router";

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
          } catch (error) {
            Alert.alert("Error", "Failed to sign out. Please try again.");
          }
        },
      },
    ]);
  };

  const SettingRow = ({
    icon,
    title,
    subtitle,
    onPress,
    danger = false,
  }: {
    icon: string;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    danger?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center p-4 bg-white border-b border-gray-100 active:bg-gray-50"
    >
      <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center mr-4">
        <Text className="text-lg">{icon}</Text>
      </View>
      <View className="flex-1">
        <Text className={`text-base ${danger ? "text-red-600" : "text-gray-900"}`}>
          {title}
        </Text>
        {subtitle && <Text className="text-gray-500 text-sm">{subtitle}</Text>}
      </View>
      {onPress && <Text className="text-gray-400">›</Text>}
    </Pressable>
  );

  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Profile Section */}
      <View className="bg-white p-6 items-center border-b border-gray-100">
        <View className="w-20 h-20 rounded-full bg-primary-100 items-center justify-center mb-4">
          <Text className="text-primary-700 text-3xl font-bold">
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </Text>
        </View>
        <Text className="text-gray-900 text-xl font-semibold">
          {user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User"}
        </Text>
        <Text className="text-gray-500">{user?.email}</Text>
      </View>

      {/* Account Section */}
      <View className="mt-6">
        <Text className="text-gray-500 text-sm font-medium px-4 pb-2 uppercase">
          Account
        </Text>
        <SettingRow
          icon="👤"
          title="Edit Profile"
          subtitle="Update your personal information"
          onPress={() => router.push("/settings/profile")}
        />
        <SettingRow
          icon="🏷️"
          title="Manage Tags"
          subtitle="Create and edit contact tags"
          onPress={() => router.push("/settings/tags")}
        />
      </View>

      {/* App Section */}
      <View className="mt-6">
        <Text className="text-gray-500 text-sm font-medium px-4 pb-2 uppercase">
          App
        </Text>
        <SettingRow
          icon="🔔"
          title="Notifications"
          subtitle="Manage notification preferences"
          onPress={() => {}}
        />
        <SettingRow
          icon="🎨"
          title="Appearance"
          subtitle="Theme and display settings"
          onPress={() => {}}
        />
      </View>

      {/* Support Section */}
      <View className="mt-6">
        <Text className="text-gray-500 text-sm font-medium px-4 pb-2 uppercase">
          Support
        </Text>
        <SettingRow
          icon="❓"
          title="Help & Support"
          onPress={() => {}}
        />
        <SettingRow
          icon="📜"
          title="Privacy Policy"
          onPress={() => {}}
        />
        <SettingRow
          icon="📋"
          title="Terms of Service"
          onPress={() => {}}
        />
      </View>

      {/* Sign Out */}
      <View className="mt-6 mb-8">
        <SettingRow
          icon="🚪"
          title="Sign Out"
          onPress={handleSignOut}
          danger
        />
      </View>

      {/* App Version */}
      <View className="items-center pb-8">
        <Text className="text-gray-400 text-sm">Orbit v1.0.0</Text>
      </View>
    </ScrollView>
  );
}
