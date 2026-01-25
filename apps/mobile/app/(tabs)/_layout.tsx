import { Tabs } from "expo-router";
import { View, Text, Platform } from "react-native";

type TabIconProps = {
  focused: boolean;
  icon: string;
  label: string;
};

function TabIcon({ focused, icon, label }: TabIconProps) {
  return (
    <View className="items-center justify-center pt-2">
      <Text className={`text-xl ${focused ? "" : "opacity-60"}`}>{icon}</Text>
      <Text
        className={`text-xs mt-1 ${
          focused ? "text-primary-600 font-medium" : "text-gray-500"
        }`}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: "#fff",
        },
        headerTitleStyle: {
          fontWeight: "600",
          color: "#111827",
        },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopColor: "#f3f4f6",
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 85 : 65,
          paddingBottom: Platform.OS === "ios" ? 20 : 10,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Contacts",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="👥" label="Contacts" />
          ),
        }}
      />
      <Tabs.Screen
        name="conversations"
        options={{
          title: "Conversations",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="💬" label="Chats" />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="📅" label="Events" />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="⚙️" label="Settings" />
          ),
        }}
      />
    </Tabs>
  );
}
