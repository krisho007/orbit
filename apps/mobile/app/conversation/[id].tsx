import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import {
  Phone,
  MessageCircle,
  Mail,
  Handshake,
  Monitor,
  Building2,
  FileText,
  ChevronLeft,
  Pencil,
  Trash2,
  CalendarClock,
  StickyNote,
  Link,
  Users,
  Calendar,
} from "lucide-react-native";
import { conversationsApi, Conversation } from "../../lib/api";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { useDeleteConversation } from "../../hooks/use-conversations";
import { useConfirmDialog } from "../../components/confirm-dialog";

const MEDIUM_META: Record<
  string,
  { label: string; icon: typeof Phone }
> = {
  PHONE_CALL: { label: "Phone Call", icon: Phone },
  WHATSAPP: { label: "WhatsApp", icon: MessageCircle },
  EMAIL: { label: "Email", icon: Mail },
  CHANCE_ENCOUNTER: { label: "Chance Encounter", icon: Handshake },
  ONLINE_MEETING: { label: "Online Meeting", icon: Monitor },
  IN_PERSON_MEETING: { label: "In-Person Meeting", icon: Building2 },
  OTHER: { label: "Other", icon: FileText },
};

export default function ConversationDetailScreen() {
  const router = useRouter();
  const { id, from } = useLocalSearchParams<{
    id: string;
    from?: string | string[];
  }>();
  const colors = useThemeColors();
  const backHref = Array.isArray(from) ? from[0] : from;
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const deleteConversation = useDeleteConversation();
  const { confirm, ConfirmDialogElement } = useConfirmDialog();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace((backHref || "/(tabs)/index") as any);
  }, [backHref, router]);

  useEffect(() => {
    loadConversation();
  }, [id]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleBack]);

  const loadConversation = async () => {
    try {
      setIsLoading(true);
      const data = await conversationsApi.get(id);
      setConversation(data);
    } catch (error) {
      console.error("Failed to load conversation:", error);
      Alert.alert("Error", "Failed to load conversation details");
      handleBack();
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: "Delete Conversation",
      message: "Are you sure you want to delete this conversation?",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteConversation.mutateAsync(id);
      handleBack();
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      Alert.alert("Error", "Failed to delete conversation");
    }
  };

  const handleEdit = () => {
    router.push(`/conversation/${id}/edit`);
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

  if (!conversation) {
    return (
      <SafeAreaView className="flex-1 bg-background-0">
        <View className="flex-1 items-center justify-center">
          <Text className="text-typography-500">Conversation not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const participants =
    conversation.participants?.map((p) => p.contact.displayName).filter(Boolean) || [];
  const medium = MEDIUM_META[conversation.medium] || MEDIUM_META.OTHER;
  const MediumIcon = medium.icon;
  const happenedAt = new Date(conversation.happenedAt);
  const happenedAtLabel = Number.isNaN(happenedAt.getTime())
    ? "Date unknown"
    : format(happenedAt, "EEEE, MMM d, yyyy 'at' h:mm a");

  const hasDetails = !!(conversation.content || conversation.followUpAt || participants.length > 0);

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={handleBack} className="p-2">
          <ChevronLeft size={22} color={getThemeColor(colors, "primary-600")} />
        </Pressable>
        <Text className="text-lg font-body-semibold text-typography-900">Conversation</Text>
        <View className="flex-row items-center">
          <Pressable onPress={handleDelete} className="p-2 mr-1">
            <Trash2 size={20} color={getThemeColor(colors, "error-500")} />
          </Pressable>
          <Pressable onPress={handleEdit} className="p-2">
            <Pencil size={20} color={getThemeColor(colors, "primary-600")} />
          </Pressable>
        </View>
      </View>

      <ScrollView className="flex-1">
        {/* Hero Section */}
        <View className="items-center py-8">
          <View className="w-16 h-16 rounded-2xl bg-primary-100 items-center justify-center mb-4">
            <MediumIcon size={28} color={getThemeColor(colors, "primary-600")} />
          </View>
          <Text className="text-2xl font-heading-bold text-typography-900 mb-1">
            {medium.label}
          </Text>
          <Text className="text-typography-500 text-base">
            {happenedAtLabel}
          </Text>
        </View>

        {/* Consolidated Details Card */}
        {hasDetails && (
          <View className="mx-4 mb-2 rounded-xl bg-background-50 border border-border-200 overflow-hidden">
            {(() => {
              const rows: React.ReactNode[] = [];

              if (participants.length > 0) {
                rows.push(
                  <View key="participants" className="flex-row items-start px-4 py-3">
                    <Users size={16} color={getThemeColor(colors, "typography-400")} />
                    <View className="ml-3 flex-1">
                      <Text className="text-typography-400 text-xs">Participants</Text>
                      <Text className="text-typography-900 text-base">
                        {participants.join(", ")}
                      </Text>
                    </View>
                  </View>
                );
              }

              if (conversation.content) {
                rows.push(
                  <View key="notes" className="flex-row items-start px-4 py-3">
                    <StickyNote size={16} color={getThemeColor(colors, "typography-400")} />
                    <View className="ml-3 flex-1">
                      <Text className="text-typography-400 text-xs">Notes</Text>
                      <Text className="text-typography-900 text-base">
                        {conversation.content}
                      </Text>
                    </View>
                  </View>
                );
              }

              if (conversation.followUpAt) {
                rows.push(
                  <View key="followup" className="flex-row items-center px-4 py-3">
                    <CalendarClock size={16} color={getThemeColor(colors, "typography-400")} />
                    <View className="ml-3 flex-1">
                      <Text className="text-typography-400 text-xs">Follow-up</Text>
                      <Text className="text-typography-900 text-base">
                        {format(new Date(conversation.followUpAt), "MMM d, yyyy")}
                      </Text>
                    </View>
                  </View>
                );
              }

              return rows.map((row, i) => (
                <View key={i}>
                  {i > 0 && <View className="border-b border-border-200 mx-4" />}
                  {row}
                </View>
              ));
            })()}
          </View>
        )}

        {/* Linked Event */}
        <View className="px-4 mt-6">
          <Text className="text-typography-900 text-base font-body-semibold mb-3">
            Linked Event
          </Text>
          {conversation.event ? (
            <Pressable
              onPress={() => router.push(`/event/${conversation.event!.id}`)}
              className="p-4 rounded-xl border border-border-200 bg-background-50 active:bg-background-100"
            >
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mr-3">
                  <Calendar size={18} color={getThemeColor(colors, "primary-600")} />
                </View>
                <View className="flex-1">
                  <Text className="text-typography-900 text-sm font-body-semibold">
                    {conversation.event.title}
                  </Text>
                  <Text className="text-primary-600 text-sm mt-1">View event</Text>
                </View>
              </View>
            </Pressable>
          ) : (
            <View className="flex-row items-center py-2">
              <Link size={16} color={getThemeColor(colors, "typography-400")} />
              <Text className="text-typography-400 text-sm ml-2">No linked event</Text>
            </View>
          )}
        </View>

        <View className="h-8" />
      </ScrollView>

      {ConfirmDialogElement}
    </SafeAreaView>
  );
}
