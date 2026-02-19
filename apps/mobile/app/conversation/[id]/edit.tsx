import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import {
  conversationsApi,
  Conversation,
  ConversationMedium,
} from "../../../lib/api";
import { getThemeColor, useThemeColors } from "../../../lib/theme";
import { useUpdateConversation } from "../../../hooks/use-conversations";

const MEDIUM_OPTIONS: { value: ConversationMedium; label: string }[] = [
  { value: "PHONE_CALL", label: "Phone Call" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "CHANCE_ENCOUNTER", label: "Chance Encounter" },
  { value: "ONLINE_MEETING", label: "Online Meeting" },
  { value: "IN_PERSON_MEETING", label: "In-Person Meeting" },
  { value: "OTHER", label: "Other" },
];

function formatDateInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd HH:mm");
}

function parseDateInput(value: string): string | null {
  const normalized = value.trim().replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export default function EditConversationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const placeholderColor = getThemeColor(colors, "typography-500");
  const updateConversation = useUpdateConversation();
  const [isLoading, setIsLoading] = useState(true);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [formData, setFormData] = useState({
    content: "",
    medium: "OTHER" as ConversationMedium,
    happenedAt: "",
    followUpAt: "",
    eventId: "",
  });

  useEffect(() => {
    loadConversation();
  }, [id]);

  const loadConversation = async () => {
    try {
      setIsLoading(true);
      const data = await conversationsApi.get(id);
      setConversation(data);
      setFormData({
        content: data.content || "",
        medium: data.medium,
        happenedAt: formatDateInput(data.happenedAt),
        followUpAt: formatDateInput(data.followUpAt),
        eventId: data.event?.id || data.eventId || "",
      });
    } catch (error) {
      console.error("Failed to load conversation:", error);
      Alert.alert("Error", "Failed to load conversation");
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    const happenedAt = parseDateInput(formData.happenedAt);
    if (!happenedAt) {
      Alert.alert("Error", "Enter a valid happened-at date/time");
      return;
    }

    const followUpAtParsed = formData.followUpAt.trim()
      ? parseDateInput(formData.followUpAt)
      : undefined;
    if (formData.followUpAt.trim() && !followUpAtParsed) {
      Alert.alert("Error", "Enter a valid follow-up date/time");
      return;
    }

    try {
      await updateConversation.mutateAsync({
        id,
        data: {
          content: formData.content.trim(),
          medium: formData.medium,
          happenedAt,
          followUpAt: followUpAtParsed || undefined,
          eventId: formData.eventId.trim() || undefined,
        },
      });
      router.back();
    } catch (error) {
      console.error("Failed to update conversation:", error);
      Alert.alert("Error", "Failed to update conversation");
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background-0">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={getThemeColor(colors, "primary-600")} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-200">
        <Pressable onPress={() => router.back()} className="p-2">
          <Text className="text-primary-600 text-base">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-semibold text-typography-900">Edit Conversation</Text>
        <Pressable onPress={handleSubmit} disabled={updateConversation.isPending} className="p-2">
          <Text
            className={`text-base ${
              updateConversation.isPending ? "text-typography-400" : "text-primary-600"
            }`}
          >
            {updateConversation.isPending ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4 py-6">
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Medium</Text>
          <View className="flex-row flex-wrap">
            {MEDIUM_OPTIONS.map((option) => {
              const isActive = formData.medium === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setFormData({ ...formData, medium: option.value })}
                  className={`px-3 py-1.5 rounded-full mr-2 mb-2 border ${
                    isActive
                      ? "bg-primary-100 border-primary-300"
                      : "bg-background-50 border-border-200"
                  }`}
                >
                  <Text
                    className={`text-sm font-medium ${
                      isActive ? "text-primary-700" : "text-typography-700"
                    }`}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Happened At *</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="YYYY-MM-DD HH:mm"
            placeholderTextColor={placeholderColor}
            value={formData.happenedAt}
            onChangeText={(text) => setFormData({ ...formData, happenedAt: text })}
          />
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Follow-up At</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="YYYY-MM-DD HH:mm"
            placeholderTextColor={placeholderColor}
            value={formData.followUpAt}
            onChangeText={(text) => setFormData({ ...formData, followUpAt: text })}
          />
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Linked Event ID</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="Optional event id"
            placeholderTextColor={placeholderColor}
            value={formData.eventId}
            onChangeText={(text) => setFormData({ ...formData, eventId: text })}
            autoCapitalize="none"
          />
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Notes</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="Conversation notes..."
            placeholderTextColor={placeholderColor}
            value={formData.content}
            onChangeText={(text) => setFormData({ ...formData, content: text })}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
        </View>

        {conversation?.participants && conversation.participants.length > 0 && (
          <View className="mb-4">
            <Text className="text-typography-700 text-sm font-medium mb-2">Participants</Text>
            <Text className="text-typography-500 text-sm">
              {conversation.participants.map((p) => p.contact.displayName).join(", ")}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
