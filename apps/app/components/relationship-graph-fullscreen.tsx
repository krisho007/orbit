import { Modal, View, Pressable, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { getThemeColor, useThemeColors } from "../lib/theme";
import { RelationshipGraph } from "./relationship-graph";
import type { Relationship } from "../lib/api";

type Props = {
  visible: boolean;
  onClose: () => void;
  contactId: string;
  contactName: string;
  relationships: Relationship[];
  onNodePress?: (contactId: string) => void;
};

export function RelationshipGraphFullscreen({
  visible,
  onClose,
  contactId,
  contactName,
  relationships,
  onNodePress,
}: Props) {
  const colors = useThemeColors();
  const { width, height } = useWindowDimensions();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView className="flex-1 bg-background-0">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-200">
          <View className="w-10" />
          <View className="flex-1" />
          <Pressable onPress={onClose} className="p-2">
            <X size={22} color={getThemeColor(colors, "typography-700")} />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center">
          <RelationshipGraph
            contactId={contactId}
            contactName={contactName}
            relationships={relationships}
            width={width}
            height={height - 100}
            onNodePress={(id) => {
              onClose();
              onNodePress?.(id);
            }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
