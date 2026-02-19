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
import { format, isSameDay } from "date-fns";
import {
  Briefcase,
  Phone,
  Cake,
  Heart,
  Mic,
  PartyPopper,
  Users,
  Bookmark,
  MapPin,
  MessageCircle,
  Mail,
  Handshake,
  Monitor,
  Building2,
  FileText,
  ChevronLeft,
  Pencil,
  Trash2,
  CalendarDays,
} from "lucide-react-native";
import { eventsApi, Event, Conversation } from "../../lib/api";
import { getThemeColor, useThemeColors } from "../../lib/theme";

const EVENT_META: Record<
  string,
  { label: string; icon: typeof Briefcase }
> = {
  MEETING: { label: "Meeting", icon: Briefcase },
  CALL: { label: "Call", icon: Phone },
  BIRTHDAY: { label: "Birthday", icon: Cake },
  ANNIVERSARY: { label: "Anniversary", icon: Heart },
  CONFERENCE: { label: "Conference", icon: Mic },
  SOCIAL: { label: "Social", icon: PartyPopper },
  FAMILY_EVENT: { label: "Family Event", icon: Users },
  OTHER: { label: "Other", icon: Bookmark },
};

const CONVERSATION_MEDIUM_META: Record<
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

function formatDateRange(startAt: string, endAt?: string | null): string {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return "Date unknown";

  const startFormatted = format(start, "MMM d, yyyy");
  const startTime = format(start, "h:mm a");

  if (!endAt) {
    return `${startFormatted} at ${startTime}`;
  }

  const end = new Date(endAt);
  if (Number.isNaN(end.getTime())) {
    return `${startFormatted} at ${startTime}`;
  }

  if (isSameDay(start, end)) {
    return `${startFormatted} at ${startTime} — ${format(end, "h:mm a")}`;
  }

  return `${startFormatted} at ${startTime} — ${format(end, "MMM d, yyyy")} at ${format(end, "h:mm a")}`;
}

export default function EventDetailScreen() {
  const router = useRouter();
  const { id, from } = useLocalSearchParams<{
    id: string;
    from?: string | string[];
  }>();
  const colors = useThemeColors();
  const backHref = Array.isArray(from) ? from[0] : from;
  const [event, setEvent] = useState<Event | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [nextConversationCursor, setNextConversationCursor] = useState<string | null>(
    null
  );
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace((backHref || "/(tabs)/index") as any);
  }, [backHref, router]);

  useEffect(() => {
    loadEvent();
  }, [id]);

  useEffect(() => {
    loadEventConversations();
  }, [id]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleBack]);

  const loadEvent = async () => {
    try {
      setIsLoading(true);
      const data = await eventsApi.get(id);
      setEvent(data);
    } catch (error) {
      console.error("Failed to load event:", error);
      Alert.alert("Error", "Failed to load event details");
      handleBack();
    } finally {
      setIsLoading(false);
    }
  };

  const loadEventConversations = async () => {
    try {
      setIsLoadingConversations(true);
      const data = await eventsApi.listConversations(id, {
        limit: 10,
      });
      setConversations(data.conversations);
      setNextConversationCursor(data.nextCursor);
    } catch (error) {
      console.error("Failed to load event conversations:", error);
      setConversations([]);
      setNextConversationCursor(null);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const loadMoreConversations = async () => {
    if (!nextConversationCursor || isLoadingMoreConversations) {
      return;
    }

    try {
      setIsLoadingMoreConversations(true);
      const data = await eventsApi.listConversations(id, {
        cursor: nextConversationCursor,
        limit: 10,
      });
      setConversations((prev) => [...prev, ...data.conversations]);
      setNextConversationCursor(data.nextCursor);
    } catch (error) {
      console.error("Failed to load more event conversations:", error);
      setNextConversationCursor(null);
    } finally {
      setIsLoadingMoreConversations(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert("Delete Event", "Are you sure you want to delete this event?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await eventsApi.delete(id);
            handleBack();
          } catch (error) {
            console.error("Failed to delete event:", error);
            Alert.alert("Error", "Failed to delete event");
          }
        },
      },
    ]);
  };

  const handleEdit = () => {
    router.push(`/event/${id}/edit`);
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

  if (!event) {
    return (
      <SafeAreaView className="flex-1 bg-background-0">
        <View className="flex-1 items-center justify-center">
          <Text className="text-typography-500">Event not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const meta = EVENT_META[event.eventType] || EVENT_META.OTHER;
  const EventIcon = meta.icon;
  const hasLocation = !!event.location;
  const hasDescription = !!event.description;
  const hasParticipants = !!(event.participants && event.participants.length > 0);
  const hasDetailsCard = hasLocation || hasDescription || hasParticipants;

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={handleBack} className="p-2">
          <ChevronLeft size={22} color={getThemeColor(colors, "primary-600")} />
        </Pressable>
        <Text className="text-lg font-semibold text-typography-900">Event</Text>
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
        {/* Hero — Icon, Title, Date Range */}
        <View className="items-center py-8">
          <View className="w-16 h-16 rounded-2xl bg-primary-100 items-center justify-center mb-4">
            <CalendarDays size={28} color={getThemeColor(colors, "primary-600")} />
          </View>
          <Text className="text-2xl font-bold text-typography-900 mb-1 text-center px-4">
            {event.title}
          </Text>
          <Text className="text-typography-500 text-base text-center px-4 mb-1">
            {meta.label}
          </Text>
          <Text className="text-typography-500 text-sm text-center px-4">
            {formatDateRange(event.startAt, event.endAt)}
          </Text>
        </View>

        {/* Consolidated Details Card */}
        {hasDetailsCard && (
          <View className="mx-4 mb-2 rounded-xl bg-background-50 border border-border-200 overflow-hidden">
            {(() => {
              const rows: React.ReactNode[] = [];

              if (hasLocation) {
                rows.push(
                  <View key="location" className="flex-row items-start px-4 py-3">
                    <MapPin size={16} color={getThemeColor(colors, "typography-400")} />
                    <View className="ml-3 flex-1">
                      <Text className="text-typography-400 text-xs">Location</Text>
                      <Text className="text-typography-900 text-base">{event.location}</Text>
                    </View>
                  </View>
                );
              }

              if (hasDescription) {
                rows.push(
                  <View key="description" className="flex-row items-start px-4 py-3">
                    <FileText size={16} color={getThemeColor(colors, "typography-400")} />
                    <View className="ml-3 flex-1">
                      <Text className="text-typography-400 text-xs">Description</Text>
                      <Text className="text-typography-900 text-base" numberOfLines={3}>
                        {event.description}
                      </Text>
                    </View>
                  </View>
                );
              }

              if (hasParticipants) {
                const participantNames = event.participants!
                  .map((p) => p.contact.displayName)
                  .filter(Boolean)
                  .join(", ");
                rows.push(
                  <View key="participants" className="flex-row items-start px-4 py-3">
                    <Users size={16} color={getThemeColor(colors, "typography-400")} />
                    <View className="ml-3 flex-1">
                      <Text className="text-typography-400 text-xs">Participants</Text>
                      <Text className="text-typography-900 text-base">{participantNames}</Text>
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

        {/* Linked Conversations */}
        <View className="px-4 mt-6">
          <View className="mb-3">
            <Text className="text-typography-900 text-base font-semibold">
              Linked Conversations
            </Text>
          </View>

          {isLoadingConversations ? (
            <View className="py-8 items-center">
              <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
            </View>
          ) : conversations.length === 0 ? (
            <View className="flex-row items-center py-2">
              <MessageCircle size={16} color={getThemeColor(colors, "typography-400")} />
              <Text className="text-typography-400 text-sm ml-2">No linked conversations</Text>
            </View>
          ) : (
            <>
              {conversations.map((conversation) => {
                const medium =
                  CONVERSATION_MEDIUM_META[conversation.medium] ||
                  CONVERSATION_MEDIUM_META.OTHER;
                const MediumIcon = medium.icon;
                const convoDate = new Date(conversation.happenedAt);
                const convoLabel = Number.isNaN(convoDate.getTime())
                  ? "Date unknown"
                  : format(convoDate, "MMM d, yyyy");
                const participants =
                  conversation.participants
                    ?.map((p) => p.contact.displayName)
                    .filter(Boolean)
                    .join(", ") || "";

                return (
                  <Pressable
                    key={conversation.id}
                    onPress={() => router.push(`/conversation/${conversation.id}`)}
                    className="mb-3 p-4 rounded-xl border border-border-200 bg-background-50 active:bg-background-100"
                  >
                    <View className="flex-row items-start">
                      <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mr-3">
                        <MediumIcon size={18} color={getThemeColor(colors, "primary-600")} />
                      </View>

                      <View className="flex-1">
                        <View className="flex-row items-center justify-between mb-1">
                          <Text className="text-typography-900 text-sm font-semibold">
                            {medium.label}
                          </Text>
                          <Text className="text-typography-400 text-xs ml-2">{convoLabel}</Text>
                        </View>

                        {participants ? (
                          <Text className="text-typography-500 text-xs mb-1" numberOfLines={1}>
                            {participants}
                          </Text>
                        ) : null}

                        {conversation.content ? (
                          <Text className="text-typography-700 text-sm" numberOfLines={2}>
                            {conversation.content}
                          </Text>
                        ) : (
                          <Text className="text-typography-400 text-sm italic">No notes</Text>
                        )}
                      </View>
                    </View>
                  </Pressable>
                );
              })}

              {nextConversationCursor && (
                <Pressable
                  onPress={loadMoreConversations}
                  disabled={isLoadingMoreConversations}
                  className="mt-1 py-3 rounded-lg bg-background-100 active:bg-background-200"
                >
                  {isLoadingMoreConversations ? (
                    <ActivityIndicator
                      size="small"
                      color={getThemeColor(colors, "primary-600")}
                    />
                  ) : (
                    <Text className="text-primary-600 text-center text-sm font-medium">
                      Load more conversations
                    </Text>
                  )}
                </Pressable>
              )}
            </>
          )}
        </View>

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
