import { useCallback, type ReactNode } from "react";
import { Dimensions } from "react-native";
import { useFocusEffect } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
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
const SLIDE_DISTANCE = Dimensions.get("window").width * 0.3;

let lastActiveTabIndex = -1;

export function AnimatedTabScreen({
  children,
  tabName,
}: {
  children: ReactNode;
  tabName: string;
}) {
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
      translateX.value = direction * SLIDE_DISTANCE;
      opacity.value = 0.7;

      translateX.value = withTiming(0, {
        duration: 350,
        easing: Easing.out(Easing.cubic),
      });
      opacity.value = withTiming(1, { duration: 300 });

      lastActiveTabIndex = currentIndex;
    }, [currentIndex, translateX, opacity])
  );

  const animatedStyle = useAnimatedStyle(() => ({
    flex: 1,
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
    backgroundColor: bgColor,
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}
