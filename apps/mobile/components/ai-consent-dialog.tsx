import { View, Text, Pressable, Modal } from "react-native";
import { ExternalLink } from "lucide-react-native";
import { getThemeColor, useThemeColors } from "../lib/theme";

const CONSENT_CONFIG = {
  title: "Third-Party AI Processing",
  description:
    "Orbit uses third-party AI providers to power features like the AI assistant and voice input. Your data (contact names, notes, event details, and audio recordings) is sent to these providers for processing only and is not stored for training.",
  policyLabel: "Data & Third Parties",
  agreeLabel: "I Agree",
};

export function AiConsentDialog({
  visible,
  onAgree,
  onDismiss,
  onViewDetails,
}: {
  visible: boolean;
  onAgree: () => void;
  onDismiss: () => void;
  onViewDetails?: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View className="flex-1 justify-center items-center bg-black/50 px-6">
        <View
          style={{ backgroundColor: getThemeColor(colors, "background-0") }}
          className="rounded-3xl p-6 w-full max-w-md"
        >
          <Text
            style={{ color: getThemeColor(colors, "typography-900") }}
            className="text-lg font-body-semibold mb-3"
          >
            {CONSENT_CONFIG.title}
          </Text>
          <Text
            style={{ color: getThemeColor(colors, "typography-700") }}
            className="text-sm leading-5 mb-4"
          >
            {CONSENT_CONFIG.description}
          </Text>

          {onViewDetails && (
            <Pressable
              onPress={onViewDetails}
              className="flex-row items-center mb-6 active:opacity-70"
            >
              <ExternalLink size={14} color={getThemeColor(colors, "primary-600")} />
              <Text
                style={{ color: getThemeColor(colors, "primary-600") }}
                className="text-sm ml-1.5"
              >
                {CONSENT_CONFIG.policyLabel}
              </Text>
            </Pressable>
          )}

          <View className="flex-row justify-end">
            <Pressable
              onPress={onDismiss}
              className="px-5 py-3 rounded-xl mr-3 active:bg-background-100"
            >
              <Text
                style={{ color: getThemeColor(colors, "typography-600") }}
                className="text-sm font-body-medium"
              >
                Not Now
              </Text>
            </Pressable>
            <Pressable
              onPress={onAgree}
              style={{ backgroundColor: getThemeColor(colors, "primary-600") }}
              className="px-5 py-3 rounded-xl"
            >
              <Text
                style={{ color: getThemeColor(colors, "typography-0") }}
                className="text-sm font-body-semibold"
              >
                {CONSENT_CONFIG.agreeLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
