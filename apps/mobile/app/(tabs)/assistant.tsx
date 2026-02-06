import { useState, useRef, useCallback } from "react";
import type { ComponentType } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import {
  Sparkles,
  SendHorizonal,
  Phone,
  MessageCircle,
  Mail,
  Handshake,
  Monitor,
  Building2,
  FileText,
  CalendarDays,
  MapPin,
} from "lucide-react-native";
import {
  assistantApi,
  ChatMessage,
  AssistantUi,
  AssistantContactCard,
  AssistantConversationCard,
  AssistantEventCard,
} from "../../lib/api";
import { getThemeColor, useThemeColors } from "../../lib/theme";

type Message = ChatMessage & {
  id: string;
  isLoading?: boolean;
};

const SUGGESTIONS = [
  "Show my recent conversations",
  "What are my upcoming events?",
  "Find contacts named John",
  "I had a call with Sarah today",
];

const RESULT_CARD_LIMIT = 10;

const MEDIUM_META: Record<
  string,
  { label: string; icon: ComponentType<{ size?: number; color?: string }> }
> = {
  PHONE_CALL: { label: "Phone Call", icon: Phone },
  WHATSAPP: { label: "WhatsApp", icon: MessageCircle },
  EMAIL: { label: "Email", icon: Mail },
  CHANCE_ENCOUNTER: { label: "Chance Encounter", icon: Handshake },
  ONLINE_MEETING: { label: "Online Meeting", icon: Monitor },
  IN_PERSON_MEETING: { label: "In-Person Meeting", icon: Building2 },
  OTHER: { label: "Other", icon: FileText },
};

export default function AssistantScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Hi! I'm your Orbit assistant. I can help you:

• Log conversations
• Find conversations
• Create events
• Search contacts
• Get contact info

What would you like to do?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text.trim(),
      };

      const loadingMessage: Message = {
        id: `loading-${Date.now()}`,
        role: "assistant",
        content: "",
        isLoading: true,
      };

      setMessages((prev) => [...prev, userMessage, loadingMessage]);
      setInput("");
      setIsLoading(true);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

      try {
        const chatHistory: ChatMessage[] = [
          ...messages
            .filter((m) => !m.isLoading && m.id !== "welcome")
            .map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: text.trim() },
        ];

        const response = await assistantApi.chat(chatHistory);

        setMessages((prev) => {
          const filtered = prev.filter((m) => !m.isLoading);
          return [
            ...filtered,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              content: response.content,
              ui: response.ui ?? null,
            },
          ];
        });
      } catch (error) {
        console.error("Assistant error:", error);
        setMessages((prev) => {
          const filtered = prev.filter((m) => !m.isLoading);
          return [
            ...filtered,
            {
              id: `error-${Date.now()}`,
              role: "assistant",
              content: "Sorry, I encountered an error. Please try again.",
            },
          ];
        });
      } finally {
        setIsLoading(false);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    },
    [messages, isLoading]
  );

  const handleSuggestion = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const formatDateTime = (value: string, pattern: string, fallback: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return format(date, pattern);
  };

  const renderContactCard = (contact: AssistantContactCard) => {
    const subtitle = [contact.jobTitle, contact.company].filter(Boolean).join(" at ");
    const detail =
      contact.primaryPhone || contact.primaryEmail || contact.location || undefined;
    const initial = contact.displayName?.charAt(0)?.toUpperCase() || "?";

    return (
      <Pressable
        key={contact.id}
        onPress={() => router.push(`/contact/${contact.id}`)}
        className="bg-background-0 border border-border-100 rounded-2xl p-4 mb-3 active:bg-background-50"
      >
        <View className="flex-row items-center">
          <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mr-3">
            <Text className="text-primary-700 text-base font-semibold">{initial}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-typography-900 font-semibold text-base" numberOfLines={1}>
              {contact.displayName}
            </Text>
            {subtitle.length > 0 && (
              <Text className="text-typography-600 text-sm mt-0.5" numberOfLines={1}>
                {subtitle}
              </Text>
            )}
            {detail && (
              <Text className="text-typography-500 text-sm" numberOfLines={1}>
                {detail}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  const renderConversationCard = (conversation: AssistantConversationCard) => {
    const participants =
      conversation.participants && conversation.participants.length > 0
        ? conversation.participants.join(", ")
        : "Unknown";
    const medium = MEDIUM_META[conversation.medium] || MEDIUM_META.OTHER;
    const MediumIcon = medium.icon;
    const happenedAtLabel = formatDateTime(
      conversation.happenedAt,
      "MMM d, yyyy",
      "Date unknown"
    );

    return (
      <Pressable
        key={conversation.id}
        onPress={() => router.push(`/conversation/${conversation.id}`)}
        className="bg-background-0 border border-border-100 rounded-2xl p-4 mb-3 active:bg-background-50"
      >
        <View className="flex-row items-start">
          <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mr-3">
            <MediumIcon size={18} color={getThemeColor(colors, "primary-600")} />
          </View>
          <View className="flex-1">
            <Text className="text-typography-900 font-semibold text-base" numberOfLines={1}>
              {participants}
            </Text>
            <Text className="text-typography-500 text-sm mt-0.5">
              {medium.label} · {happenedAtLabel}
            </Text>
            {conversation.content && (
              <Text className="text-typography-700 text-sm mt-2" numberOfLines={2}>
                {conversation.content}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  const renderEventCard = (event: AssistantEventCard) => {
    const dateLabel = formatDateTime(event.startAt, "MMM d, yyyy", "Date unknown");
    const timeLabel = formatDateTime(event.startAt, "h:mm a", "");
    const participantCount = event.participants?.length || 0;

    return (
      <Pressable
        key={event.id}
        onPress={() => router.push(`/event/${event.id}`)}
        className="bg-background-0 border border-border-100 rounded-2xl p-4 mb-3 active:bg-background-50"
      >
        <View className="flex-row items-start">
          <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mr-3">
            <CalendarDays size={18} color={getThemeColor(colors, "primary-600")} />
          </View>
          <View className="flex-1">
            <Text className="text-typography-900 font-semibold text-base" numberOfLines={1}>
              {event.title}
            </Text>
            <Text className="text-typography-500 text-sm mt-0.5">
              {dateLabel}
              {timeLabel ? ` · ${timeLabel}` : ""}
            </Text>
            {event.location && (
              <View className="flex-row items-center mt-1">
                <MapPin size={12} color={getThemeColor(colors, "typography-500")} />
                <Text className="text-typography-500 text-sm ml-1" numberOfLines={1}>
                  {event.location}
                </Text>
              </View>
            )}
            {participantCount > 0 && (
              <Text className="text-typography-500 text-sm mt-1">
                {participantCount} participant{participantCount !== 1 ? "s" : ""}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  const renderAssistantUi = (ui: AssistantUi) => {
    if (ui.kind === "contact") {
      return <View>{renderContactCard(ui.contact)}</View>;
    }

    if (ui.kind === "contacts") {
      const cards = ui.contacts.slice(0, RESULT_CARD_LIMIT);
      const count = ui.count || cards.length;
      const showCountLabel = count > cards.length;
      const showScrollableResults = cards.length > 2;
      return (
        <View>
          {showCountLabel && (
            <Text className="text-typography-500 text-xs mb-2">
              Showing {cards.length} of {count} contacts
            </Text>
          )}
          {showScrollableResults ? (
            <ScrollView
              className="max-h-[340px]"
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {cards.map(renderContactCard)}
            </ScrollView>
          ) : (
            cards.map(renderContactCard)
          )}
        </View>
      );
    }

    if (ui.kind === "conversations") {
      const cards = ui.conversations.slice(0, RESULT_CARD_LIMIT);
      const count = ui.count || cards.length;
      const showCountLabel = count > cards.length;
      const showScrollableResults = cards.length > 2;
      return (
        <View>
          {showCountLabel && (
            <Text className="text-typography-500 text-xs mb-2">
              Showing {cards.length} of {count} conversations
            </Text>
          )}
          {showScrollableResults ? (
            <ScrollView
              className="max-h-[340px]"
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {cards.map(renderConversationCard)}
            </ScrollView>
          ) : (
            cards.map(renderConversationCard)
          )}
        </View>
      );
    }

    if (ui.kind === "events") {
      const cards = ui.events.slice(0, RESULT_CARD_LIMIT);
      const count = ui.count || cards.length;
      const showCountLabel = count > cards.length;
      const showScrollableResults = cards.length > 2;
      return (
        <View>
          {showCountLabel && (
            <Text className="text-typography-500 text-xs mb-2">
              Showing {cards.length} of {count} events
            </Text>
          )}
          {showScrollableResults ? (
            <ScrollView
              className="max-h-[340px]"
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {cards.map(renderEventCard)}
            </ScrollView>
          ) : (
            cards.map(renderEventCard)
          )}
        </View>
      );
    }

    return null;
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    const hasContent = item.content && item.content.trim().length > 0;
    const showUi = !isUser && item.ui;

    if (item.isLoading) {
      return (
        <View className="flex-row justify-start mb-3 px-4">
          <View className="bg-background-100 rounded-2xl rounded-bl-md px-4 py-3 max-w-[85%]">
            <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
          </View>
        </View>
      );
    }

    return (
      <View className="mb-3">
        {hasContent && (
          <View
            className={`flex-row px-4 ${isUser ? "justify-end" : "justify-start"}`}
          >
            <View
              className={`rounded-2xl px-4 py-3 max-w-[85%] ${
                isUser
                  ? "bg-primary-600 rounded-br-md"
                  : "bg-background-100 rounded-bl-md"
              }`}
            >
              <Text
                className="text-base leading-6"
                style={{
                  color: isUser
                    ? getThemeColor(colors, "typography-0")
                    : getThemeColor(colors, "typography-800"),
                }}
              >
                {item.content}
              </Text>
            </View>
          </View>
        )}
        {showUi && (
          <View className={`px-4 ${hasContent ? "mt-2" : ""}`}>
            {renderAssistantUi(item.ui!)}
          </View>
        )}
      </View>
    );
  };

  const ListHeader = () => (
    <View className="py-6">
      <View className="items-center mb-4">
        <View className="w-16 h-16 bg-primary-100 rounded-3xl items-center justify-center">
          <Sparkles size={26} color={getThemeColor(colors, "primary-600")} />
        </View>
      </View>
    </View>
  );

  const ListFooter = () => (
    <View className="pb-4">
      {messages.length <= 1 && (
        <View className="px-4 mt-2">
          <Text className="text-typography-500 text-sm mb-3">Try saying:</Text>
          <View className="flex-row flex-wrap">
            {SUGGESTIONS.map((suggestion, index) => (
              <Pressable
                key={index}
                onPress={() => handleSuggestion(suggestion)}
                className="bg-background-0 border border-border-200 rounded-full px-4 py-2 mr-2 mb-2 active:bg-background-50"
              >
                <Text className="text-typography-700 text-sm">{suggestion}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background-50"
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        contentContainerStyle={{ flexGrow: 1 }}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
      />

      <View className="border-t border-border-200 px-4 py-3 bg-background-0">
        <View className="flex-row items-end">
          <View className="flex-1 bg-background-100 rounded-2xl px-4 py-3 mr-2 min-h-[140px] max-h-[220px]">
            <TextInput
              className="text-base text-typography-900 flex-1"
              placeholder="Ask me anything..."
              placeholderTextColor={getThemeColor(colors, "typography-500")}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              editable={!isLoading}
              onSubmitEditing={() => sendMessage(input)}
              submitBehavior="submit"
              blurOnSubmit={false}
              returnKeyType="send"
            />
          </View>
          <Pressable
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className={`w-11 h-11 rounded-full items-center justify-center ${
              input.trim() && !isLoading
                ? "bg-primary-600 active:bg-primary-700"
                : "bg-border-200"
            }`}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={getThemeColor(colors, "typography-0")} />
            ) : (
              <SendHorizonal
                size={18}
                color={
                  input.trim()
                    ? getThemeColor(colors, "typography-0")
                    : getThemeColor(colors, "typography-400")
                }
              />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
