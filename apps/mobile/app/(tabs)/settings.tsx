import { View, Text, Pressable, Alert, ScrollView, Switch } from "react-native";
import type { ComponentType } from "react";
import { useAuth } from "../../lib/auth";
import { useRouter } from "expo-router";
import {
  User,
  Tags,
  Download,
  Bell,
  Palette,
  HelpCircle,
  Shield,
  FileText,
  LogOut,
  ChevronRight,
} from "lucide-react-native";
import { getThemeColor, useThemeColors, useThemeMode } from "../../lib/theme";

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const colors = useThemeColors();
  const { mode, setMode } = useThemeMode();
  const isDarkMode = mode === "dark";

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
    icon: Icon,
    title,
    subtitle,
    onPress,
    danger = false,
  }: {
    icon: ComponentType<{ size?: number; color?: string }>;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    danger?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center p-4 bg-background-0 border-b border-border-100 active:bg-background-50"
    >
      <View
        className={`w-10 h-10 rounded-2xl items-center justify-center mr-4 ${
          danger ? "bg-error-50" : "bg-primary-100"
        }`}
      >
        <Icon
          size={18}
          color={
            danger
              ? getThemeColor(colors, "error-600")
              : getThemeColor(colors, "primary-600")
          }
        />
      </View>
      <View className="flex-1">
        <Text
          className={`text-base ${
            danger ? "text-error-600" : "text-typography-900"
          }`}
        >
          {title}
        </Text>
        {subtitle && <Text className="text-typography-500 text-sm">{subtitle}</Text>}
      </View>
      {onPress && (
        <ChevronRight size={16} color={getThemeColor(colors, "typography-400")} />
      )}
    </Pressable>
  );

  return (
    <ScrollView className="flex-1 bg-background-50">
      <View className="bg-background-0 p-4 border-b border-border-100">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-typography-900 text-base font-semibold">
              Dark Mode
            </Text>
            <Text className="text-typography-500 text-sm">
              Follow system when off
            </Text>
          </View>
          <Switch
            value={isDarkMode}
            onValueChange={(value) => setMode(value ? "dark" : "system")}
            trackColor={{
              false: getThemeColor(colors, "border-300"),
              true: getThemeColor(colors, "primary-500"),
            }}
            thumbColor={
              isDarkMode
                ? getThemeColor(colors, "primary-700")
                : getThemeColor(colors, "background-0")
            }
            ios_backgroundColor={getThemeColor(colors, "border-300")}
          />
        </View>
      </View>
      <View className="bg-background-0 p-6 items-center border-b border-border-100">
        <View className="w-20 h-20 rounded-3xl bg-primary-100 items-center justify-center mb-4">
          <Text className="text-primary-700 text-3xl font-bold">
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </Text>
        </View>
        <Text className="text-typography-900 text-xl font-semibold">
          {user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User"}
        </Text>
        <Text className="text-typography-500">{user?.email}</Text>
      </View>

      <View className="mt-6">
        <Text className="text-typography-500 text-sm font-medium px-4 pb-2 uppercase">
          Account
        </Text>
        <SettingRow
          icon={User}
          title="Edit Profile"
          subtitle="Update your personal information"
          onPress={() =>
            Alert.alert("Coming Soon", "Profile settings will be available soon.")
          }
        />
        <SettingRow
          icon={Tags}
          title="Manage Tags"
          subtitle="Create and edit contact tags"
          onPress={() =>
            Alert.alert("Coming Soon", "Tag management will be available soon.")
          }
        />
        <SettingRow
          icon={Download}
          title="Import Google Contacts"
          subtitle="Fetch and merge contacts from your Google account"
          onPress={() =>
            router.push({
              pathname: "/google-import" as any,
              params: { entry: "settings" },
            })
          }
        />
      </View>

      <View className="mt-6">
        <Text className="text-typography-500 text-sm font-medium px-4 pb-2 uppercase">
          App
        </Text>
        <SettingRow
          icon={Bell}
          title="Notifications"
          subtitle="Manage notification preferences"
          onPress={() => {}}
        />
        <SettingRow
          icon={Palette}
          title="Appearance"
          subtitle="Theme and display settings"
          onPress={() => {}}
        />
      </View>

      <View className="mt-6">
        <Text className="text-typography-500 text-sm font-medium px-4 pb-2 uppercase">
          Support
        </Text>
        <SettingRow icon={HelpCircle} title="Help & Support" onPress={() => {}} />
        <SettingRow icon={Shield} title="Privacy Policy" onPress={() => {}} />
        <SettingRow icon={FileText} title="Terms of Service" onPress={() => {}} />
      </View>

      <View className="mt-6 mb-8">
        <SettingRow icon={LogOut} title="Sign Out" onPress={handleSignOut} danger />
      </View>

      <View className="items-center pb-8">
        <Text className="text-typography-400 text-sm">Orbit v1.0.0</Text>
      </View>
    </ScrollView>
  );
}
