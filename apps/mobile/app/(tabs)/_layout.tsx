import { Tabs } from "expo-router";
import { View, Platform } from "react-native";
import type { ComponentType } from "react";
import {
  Users,
  MessageCircle,
  CalendarDays,
  Bell,
  Sparkles,
} from "lucide-react-native";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { HeaderMenu } from "../../components/header-menu";

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

  return (
    <Tabs
      initialRouteName="assistant"
      backBehavior="history"
      screenOptions={{
        headerShown: true,
        headerRight: () => <HeaderMenu />,
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
          href: null,
          title: "Settings",
        }}
      />
    </Tabs>
  );
}
