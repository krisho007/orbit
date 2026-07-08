import { useState, useCallback, useRef } from "react";
import { View, Text, Pressable, Modal, Alert, Platform, Dimensions } from "react-native";
import { EllipsisVertical, Settings, LogOut } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { getThemeColor, useThemeColors } from "../lib/theme";
import type { ComponentType } from "react";

function MenuItem({
  icon: Icon,
  label,
  onPress,
  danger,
}: {
  icon: ComponentType<{ size?: number; color?: string }>;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-4 py-3 active:bg-background-50"
    >
      <Icon
        size={18}
        color={
          danger
            ? getThemeColor(colors, "error-600")
            : getThemeColor(colors, "typography-700")
        }
      />
      <Text
        style={{
          marginLeft: 12,
          fontSize: 16,
          color: danger
            ? getThemeColor(colors, "error-600")
            : getThemeColor(colors, "typography-900"),
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function HeaderMenu() {
  const [visible, setVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<View>(null);
  const colors = useThemeColors();
  const router = useRouter();
  const { signOut } = useAuth();

  const openMenu = useCallback(() => {
    buttonRef.current?.measureInWindow((x, y, width, height) => {
      const screenWidth = Dimensions.get("window").width;
      setMenuPos({
        top: y + height + 4,
        right: screenWidth - x - width,
      });
      setVisible(true);
    });
  }, []);

  const handleSettings = useCallback(() => {
    setVisible(false);
    router.push("/(tabs)/settings");
  }, [router]);

  const handleSignOut = useCallback(() => {
    setVisible(false);
    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to sign out?")) {
        signOut();
      }
    } else {
      Alert.alert("Sign Out", "Are you sure you want to sign out?", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: () => signOut() },
      ]);
    }
  }, [signOut]);

  return (
    <>
      <Pressable
        ref={buttonRef}
        onPress={openMenu}
        className="w-9 h-9 rounded-xl items-center justify-center active:bg-background-100"
        style={{ marginRight: 8 }}
      >
        <EllipsisVertical size={20} color={getThemeColor(colors, "typography-700")} />
      </Pressable>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={() => setVisible(false)}
        >
          <View
            style={{
              position: "absolute",
              right: menuPos.right,
              top: menuPos.top,
              backgroundColor: getThemeColor(colors, "background-0"),
              borderRadius: 16,
              borderWidth: 1,
              borderColor: getThemeColor(colors, "border-200"),
              paddingVertical: 8,
              minWidth: 200,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            <MenuItem icon={Settings} label="Settings" onPress={handleSettings} />
            <MenuItem icon={LogOut} label="Sign Out" onPress={handleSignOut} danger />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
