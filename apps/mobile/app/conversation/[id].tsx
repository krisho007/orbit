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
  Link2,
  Check,
  Users,
  Calendar,
  Briefcase,
  Cake,
  Heart,
  Mic,
  PartyPopper,
  BookOpen,
  Bookmark,
} from "lucide-react-native";
import { conversationsApi, Conversation, Event } from "../../lib/api";
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

const EVENT_META: Record<string, { label: string; icon: typeof Briefcase }> = {
  MEETING: { label: "Meeting", icon: Briefcase },
  CALL: { label: "Call", icon: Phone },
  BIRTHDAY: { label: "Birthday", icon: Cake },
  ANNIVERSARY: { label: "Anniversary", icon: Heart },
  CONFERENCE: { label: "Conference", icon: Mic },
  SOCIAL: { label: "Social", icon: PartyPopper },
  FAMILY_EVENT: { label: "Family Event", icon: Users },
  JOURNAL: { label: "Journal", icon: BookOpen },
  OTHER: { label: "Other", icon: Bookmark },
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
  const [showLinkable, setShowLinkable] = useState(false);
  const [linkableEvents, setLinkableEvents] = useState<Event[]>([]);
  const [isLoadingLinkable, setIsLoadingLinkable] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
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

  const loadLinkableEvents = async () => {
    try {
      setIsLoadingLinkable(true);
      const data = await conversationsApi.listLinkableEvents(id);
      setLinkableEvents(data.events);
    } catch (error) {
      console.error("Failed to load linkable events:", error);
      setLinkableEvents([]);
    } finally {
      setIsLoadingLinkable(false);
    }
  };

  const handleToggleLinkable = () => {
    if (!showLinkable) {
      loadLinkableEvents();
    }
    setShowLinkable(!showLinkable);
  };

  const handleLinkEvent = async (eventId: string) => {
    try {
      setLinkingId(eventId);
      await conversationsApi.update(id, { eventId });
      // Refresh conversation to show the linked event
      await loadConversation();
      setShowLinkable(false);
      setLinkableEvents([]);
    } catch (error) {
      console.error("Failed to link event:", error);
      Alert.alert("Error", "Failed to link event");
    } finally {
      setLinkingId(null);
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
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-typography-900 text-base font-body-semibold">
              Linked Event
            </Text>
            {!conversation.event && (
              <Pressable
                onPress={handleToggleLinkable}
                className={`flex-row items-center px-3 py-1.5 rounded-lg ${
                  showLinkable
                    ? "bg-primary-600"
                    : "bg-background-50 border border-border-200"
                } active:opacity-80`}
              >
                <Link2 size={14} color={showLinkable ? "#fff" : getThemeColor(colors, "primary-600")} />
                <Text className={`text-sm font-body-medium ml-1 ${showLinkable ? "text-white" : "text-primary-600"}`}>
                  Link
                </Text>
              </Pressable>
            )}
          </View>

          {/* Linkable Events Panel */}
          {showLinkable && !conversation.event && (
            <View className="mb-4 rounded-xl border border-primary-200 bg-primary-50 overflow-hidden">
              <View className="px-4 py-2.5 border-b border-primary-200">
                <Text className="text-typography-700 text-xs font-body-medium">
                  Events from {format(happenedAt, "MMM d, yyyy")}
                </Text>
              </View>
              {isLoadingLinkable ? (
                <View className="py-6 items-center">
                  <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
                </View>
              ) : linkableEvents.length === 0 ? (
                <View className="py-4 px-4">
                  <Text className="text-typography-400 text-sm text-center">
                    No events on this date
                  </Text>
                </View>
              ) : (
                linkableEvents.map((evt, index) => {
                  const eventMeta = EVENT_META[evt.eventType] || EVENT_META.OTHER;
                  const EventIcon = eventMeta.icon;
                  const eventTime = new Date(evt.startAt);
                  const timeLabel = Number.isNaN(eventTime.getTime())
                    ? ""
                    : format(eventTime, "h:mm a");
                  const isLinking = linkingId === evt.id;

                  return (
                    <View key={evt.id}>
                      {index > 0 && <View className="border-t border-primary-200" />}
                      <View className="flex-row items-center px-4 py-3">
                        <View className="w-8 h-8 rounded-lg bg-white items-center justify-center mr-3">
                          <EventIcon size={14} color={getThemeColor(colors, "primary-600")} />
                        </View>
                        <View className="flex-1 mr-2">
                          <View className="flex-row items-center">
                            <Text className="text-typography-900 text-sm font-body-medium flex-1" numberOfLines={1}>
                              {evt.title}
                            </Text>
                            {timeLabel ? (
                              <Text className="text-typography-400 text-xs ml-2">{timeLabel}</Text>
                            ) : null}
                          </View>
                          <Text className="text-typography-500 text-xs">{eventMeta.label}</Text>
                        </View>
                        <Pressable
                          onPress={() => handleLinkEvent(evt.id)}
                          disabled={isLinking}
                          className="px-3 py-1.5 rounded-lg bg-primary-600 active:bg-primary-700"
                        >
                          {isLinking ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <View className="flex-row items-center">
                              <Check size={12} color="#fff" />
                              <Text className="text-white text-xs font-body-medium ml-1">Link</Text>
                            </View>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

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
          ) : !showLinkable ? (
            <View className="flex-row items-center py-2">
              <Link size={16} color={getThemeColor(colors, "typography-400")} />
              <Text className="text-typography-400 text-sm ml-2">No linked event</Text>
            </View>
          ) : null}
        </View>

        <View className="h-8" />
      </ScrollView>

      {ConfirmDialogElement}
    </SafeAreaView>
  );
}
