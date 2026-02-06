import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
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

export default function EventDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const [event, setEvent] = useState<Event | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [nextConversationCursor, setNextConversationCursor] = useState<string | null>(
    null
  );
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadEvent();
  }, [id]);

  useEffect(() => {
    loadEventConversations();
  }, [id]);

  const loadEvent = async () => {
    try {
      setIsLoading(true);
      const data = await eventsApi.get(id);
      setEvent(data);
    } catch (error) {
      console.error("Failed to load event:", error);
      Alert.alert("Error", "Failed to load event details");
      router.back();
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
            router.back();
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
  const startDate = new Date(event.startAt);
  const endDate = event.endAt ? new Date(event.endAt) : null;
  const startLabel = Number.isNaN(startDate.getTime())
    ? "Date unknown"
    : format(startDate, "MMM d, yyyy h:mm a");
  const endLabel =
    endDate && !Number.isNaN(endDate.getTime()) ? format(endDate, "h:mm a") : "";

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-200">
        <Pressable onPress={() => router.back()} className="p-2">
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
        <View className="px-4 py-6 border-b border-border-200">
          <View className="flex-row items-center">
            <View className="w-12 h-12 rounded-2xl bg-primary-100 items-center justify-center mr-3">
              <EventIcon size={20} color={getThemeColor(colors, "primary-600")} />
            </View>
            <View className="flex-1">
              <Text className="text-typography-900 text-lg font-semibold">
                {event.title}
              </Text>
              <Text className="text-typography-500 text-sm mt-1">
                {meta.label} · {startLabel}
                {endLabel ? ` - ${endLabel}` : ""}
              </Text>
            </View>
          </View>
        </View>

        {event.location && (
          <View className="px-4 py-6 border-b border-border-200">
            <Text className="text-typography-500 text-sm font-medium mb-2">
              Location
            </Text>
            <View className="flex-row items-center bg-background-50 rounded-lg p-4">
              <MapPin size={14} color={getThemeColor(colors, "typography-500")} />
              <Text className="text-typography-900 text-base ml-2">
                {event.location}
              </Text>
            </View>
          </View>
        )}

        {event.description && (
          <View className="px-4 py-6 border-b border-border-200">
            <Text className="text-typography-500 text-sm font-medium mb-2">
              Notes
            </Text>
            <View className="bg-background-50 rounded-lg p-4">
              <Text className="text-typography-900 text-base">{event.description}</Text>
            </View>
          </View>
        )}

        {event.participants && event.participants.length > 0 && (
          <View className="px-4 py-6 border-b border-border-200">
            <Text className="text-typography-500 text-sm font-medium mb-2">
              Participants
            </Text>
            <View className="flex-row flex-wrap">
              {event.participants.map((participant) => (
                <View
                  key={participant.contact.id}
                  className="px-3 py-1.5 rounded-full bg-primary-50 mr-2 mb-2"
                >
                  <Text className="text-primary-700 text-sm font-medium">
                    {participant.contact.displayName}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View className="px-4 py-6 border-t border-border-200">
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
            <View className="py-6 px-4 bg-background-50 rounded-xl">
              <Text className="text-typography-600 text-sm">
                No conversations linked to this event yet.
              </Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}
