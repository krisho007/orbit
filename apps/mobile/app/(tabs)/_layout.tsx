import { Tabs } from "expo-router";
import { View, Text, Platform } from "react-native";
import { useEffect, type ComponentType } from "react";
import {
  Users,
  MessageCircle,
  CalendarDays,
  Bell,
} from "lucide-react-native";
import { HuskyLogo } from "../../components/HuskyLogo";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { HeaderMenu } from "../../components/header-menu";

type TabIconProps = {
  focused: boolean;
  icon: ComponentType<{ size?: number; color?: string }>;
  iconSize?: number;
};

function TabIcon({ focused, icon: Icon, iconSize = 22 }: TabIconProps) {
  const colors = useThemeColors();
  const iconColor = focused
    ? getThemeColor(colors, "primary-600")
    : getThemeColor(colors, "typography-500");

  const iconScale = useSharedValue(1);
  const bgOpacity = useSharedValue(focused ? 1 : 0);
  const indicatorScaleX = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    if (focused) {
      iconScale.value = withSequence(
        withSpring(1.18, { damping: 12, stiffness: 400 }),
        withSpring(1, { damping: 14, stiffness: 300 })
      );
      bgOpacity.value = withTiming(1, { duration: 200 });
      indicatorScaleX.value = withSpring(1, { damping: 18, stiffness: 280 });
    } else {
      iconScale.value = withSpring(1, { damping: 20, stiffness: 300 });
      bgOpacity.value = withTiming(0, { duration: 200 });
      indicatorScaleX.value = withSpring(0, { damping: 20, stiffness: 300 });
    }
  }, [focused, iconScale, bgOpacity, indicatorScaleX]);

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const bgAnimStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  const indicatorAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: indicatorScaleX.value }],
  }));

  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingTop: 8 }}>
      <View style={{ width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
        <Animated.View
          style={[
            {
              position: "absolute",
              width: 44,
              height: 44,
              borderRadius: 16,
              backgroundColor: getThemeColor(colors, "primary-100"),
            },
            bgAnimStyle,
          ]}
        />
        <Animated.View style={iconAnimStyle}>
          <Icon size={iconSize} color={iconColor} />
        </Animated.View>
      </View>
      <Animated.View
        style={[
          {
            marginTop: 4,
            height: 4,
            width: 16,
            borderRadius: 9999,
            backgroundColor: getThemeColor(colors, "primary-600"),
          },
          indicatorAnimStyle,
        ]}
      />
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
          headerLeft: () => (
            <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 16 }}>
              <HuskyLogo size={46} color={getThemeColor(colors, "primary-700")} />
              <Text style={{ fontSize: 20, fontWeight: "700", color: getThemeColor(colors, "typography-900"), marginLeft: 8 }}>
                Orbit
              </Text>
            </View>
          ),
          headerTitle: () => null,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={HuskyLogo} iconSize={32} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Contacts",
          headerLeft: () => (
            <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 16 }}>
              <HuskyLogo size={46} color={getThemeColor(colors, "primary-700")} />
              <Text style={{ fontSize: 20, fontWeight: "700", color: getThemeColor(colors, "typography-900"), marginLeft: 8 }}>
                Contacts
              </Text>
            </View>
          ),
          headerTitle: () => null,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={Users} />
          ),
        }}
      />
      <Tabs.Screen
        name="conversations"
        options={{
          title: "Conversations",
          headerLeft: () => (
            <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 16 }}>
              <HuskyLogo size={46} color={getThemeColor(colors, "primary-700")} />
              <Text style={{ fontSize: 20, fontWeight: "700", color: getThemeColor(colors, "typography-900"), marginLeft: 8 }}>
                Conversations
              </Text>
            </View>
          ),
          headerTitle: () => null,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={MessageCircle} />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          headerLeft: () => (
            <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 16 }}>
              <HuskyLogo size={46} color={getThemeColor(colors, "primary-700")} />
              <Text style={{ fontSize: 20, fontWeight: "700", color: getThemeColor(colors, "typography-900"), marginLeft: 8 }}>
                Events
              </Text>
            </View>
          ),
          headerTitle: () => null,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={CalendarDays} />
          ),
        }}
      />
      <Tabs.Screen
        name="reminders"
        options={{
          title: "Reminders",
          headerLeft: () => (
            <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 16 }}>
              <HuskyLogo size={46} color={getThemeColor(colors, "primary-700")} />
              <Text style={{ fontSize: 20, fontWeight: "700", color: getThemeColor(colors, "typography-900"), marginLeft: 8 }}>
                Reminders
              </Text>
            </View>
          ),
          headerTitle: () => null,
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
