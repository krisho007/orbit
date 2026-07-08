import { useCallback, type ReactNode } from "react";
import { View } from "react-native";
import { useFocusEffect } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import { useThemeColor } from "../lib/theme";

const TAB_ORDER = [
  "assistant",
  "index",
  "conversations",
  "events",
  "reminders",
  "settings",
];
const SLIDE_HINT = 12;
const SPRING_CONFIG = { damping: 20, stiffness: 300, mass: 0.8 };

let lastActiveTabIndex = -1;

export function AnimatedTabScreen({
  children,
  tabName,
}: {
  children: ReactNode;
  tabName: string;
}) {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const currentIndex = TAB_ORDER.indexOf(tabName);
  const bgColor = useThemeColor("background-50");

  useFocusEffect(
    useCallback(() => {
      if (lastActiveTabIndex < 0 || lastActiveTabIndex === currentIndex) {
        lastActiveTabIndex = currentIndex;
        return;
      }

      const direction = currentIndex > lastActiveTabIndex ? 1 : -1;

      scale.value = 0.97;
      translateX.value = direction * SLIDE_HINT;
      opacity.value = 0;

      scale.value = withSpring(1, SPRING_CONFIG);
      translateX.value = withSpring(0, SPRING_CONFIG);
      opacity.value = withTiming(1, { duration: 200 });

      lastActiveTabIndex = currentIndex;
    }, [currentIndex, scale, translateX, opacity])
  );

  const animatedStyle = useAnimatedStyle(() => ({
    flex: 1,
    transform: [{ scale: scale.value }, { translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={{ flex: 1, backgroundColor: bgColor }}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </View>
  );
}
