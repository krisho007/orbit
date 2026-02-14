import { Tabs, useRouter } from "expo-router";
import { View, Platform, Pressable } from "react-native";
import type { ComponentType } from "react";
import {
  Users,
  MessageCircle,
  CalendarDays,
  Bell,
  Sparkles,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react-native";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { useAuth } from "../../lib/auth";

type TabIconProps = {
  focused: boolean;
  icon: ComponentType<{ size?: number; color?: string }>;
};

function TabIcon({ focused, icon: Icon }: TabIconProps) {
  const colors = useThemeColors();
  const iconColor = focused
    ? getThemeColor(colors, "primary-600")
    : getThemeColor(colors, "typography-500");
  return (
    <View className="items-center justify-center pt-2">
      <View
        className={`w-11 h-11 rounded-2xl items-center justify-center ${
          focused ? "bg-primary-100" : "bg-transparent"
        }`}
      >
        <Icon size={22} color={iconColor} />
      </View>
      {focused && <View className="mt-1 h-1 w-4 rounded-full bg-primary-600" />}
    </View>
  );
}

export default function TabsLayout() {
  const colors = useThemeColors();
  const { signOut } = useAuth();
  const router = useRouter();

  const webHeaderRight = Platform.OS === "web" ? () => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginRight: 16 }}>
      <Pressable
        onPress={() => router.push("/(tabs)/settings")}
        style={{ padding: 6, borderRadius: 8 }}
      >
        <SettingsIcon size={20} color={getThemeColor(colors, "typography-600")} />
      </Pressable>
      <Pressable
        onPress={() => {
          if (window.confirm("Are you sure you want to sign out?")) {
            signOut();
          }
        }}
        style={{ padding: 6, borderRadius: 8 }}
      >
        <LogOut size={20} color={getThemeColor(colors, "typography-600")} />
      </Pressable>
    </View>
  ) : undefined;

  return (
    <Tabs
      initialRouteName="assistant"
      backBehavior="history"
      screenOptions={{
        headerShown: true,
        headerRight: webHeaderRight,
        headerStyle: {
          backgroundColor: getThemeColor(colors, "background-0"),
        },
        headerTitleStyle: {
          fontWeight: "700",
          color: getThemeColor(colors, "typography-900"),
        },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: getThemeColor(colors, "background-0"),
          borderTopColor: getThemeColor(colors, "border-200"),
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 86 : 68,
          paddingBottom: Platform.OS === "ios" ? 20 : 12,
        },
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="assistant"
        options={{
          title: "Orbit",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={Sparkles} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Contacts",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={Users} />
          ),
        }}
      />
      <Tabs.Screen
        name="conversations"
        options={{
          title: "Conversations",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={MessageCircle} />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={CalendarDays} />
          ),
        }}
      />
      <Tabs.Screen
        name="reminders"
        options={{
          title: "Reminders",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={Bell} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={SettingsIcon} />
          ),
        }}
      />
    </Tabs>
  );
}
