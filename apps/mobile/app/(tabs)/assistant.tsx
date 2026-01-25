import { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { assistantApi, ChatMessage } from "../../lib/api";

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

export default function AssistantScreen() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `👋 Hi! I'm your Orbit assistant. I can help you:

• **Log conversations** - "I called John yesterday"
• **Find conversations** - "Show my chats with Sarah"
• **Create events** - "Schedule a meeting with Mike"
• **Search contacts** - "Find contacts at Google"
• **Get contact info** - "What's Sarah's phone number?"

What would you like to do?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = useCallback(async (text: string) => {
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

    // Scroll to bottom
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      const chatHistory: ChatMessage[] = [
        ...messages.filter((m) => !m.isLoading).map((m) => ({
          role: m.role,
          content: m.content,
        })),
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
  }, [messages, isLoading]);

  const handleSuggestion = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";

    if (item.isLoading) {
      return (
        <View className="flex-row justify-start mb-3 px-4">
          <View className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3 max-w-[85%]">
            <ActivityIndicator size="small" color="#4F46E5" />
          </View>
        </View>
      );
    }

    return (
      <View
        className={`flex-row mb-3 px-4 ${isUser ? "justify-end" : "justify-start"}`}
      >
        <View
          className={`rounded-2xl px-4 py-3 max-w-[85%] ${
            isUser
              ? "bg-primary-600 rounded-br-md"
              : "bg-gray-100 rounded-bl-md"
          }`}
        >
          <Text
            className={`text-base leading-6 ${
              isUser ? "text-white" : "text-gray-800"
            }`}
          >
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  const ListHeader = () => (
    <View className="py-4">
      {/* Header icon */}
      <View className="items-center mb-4">
        <View className="w-16 h-16 bg-primary-100 rounded-full items-center justify-center">
          <Text className="text-3xl">🤖</Text>
        </View>
      </View>
    </View>
  );

  const ListFooter = () => (
    <View className="pb-4">
      {/* Suggestions - only show when no conversation yet */}
      {messages.length <= 1 && (
        <View className="px-4 mt-4">
          <Text className="text-gray-500 text-sm mb-3">Try saying:</Text>
          <View className="flex-row flex-wrap">
            {SUGGESTIONS.map((suggestion, index) => (
              <Pressable
                key={index}
                onPress={() => handleSuggestion(suggestion)}
                className="bg-gray-100 rounded-full px-4 py-2 mr-2 mb-2 active:bg-gray-200"
              >
                <Text className="text-gray-700 text-sm">{suggestion}</Text>
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
      className="flex-1 bg-white"
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
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Input Area */}
      <View className="border-t border-gray-200 px-4 py-3 bg-white">
        <View className="flex-row items-end">
          <View className="flex-1 bg-gray-100 rounded-2xl px-4 py-2 mr-2 min-h-[44px] max-h-[120px]">
            <TextInput
              className="text-base text-gray-900 flex-1"
              placeholder="Ask me anything..."
              placeholderTextColor="#9CA3AF"
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              editable={!isLoading}
              onSubmitEditing={() => sendMessage(input)}
              blurOnSubmit={false}
            />
          </View>
          <Pressable
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className={`w-11 h-11 rounded-full items-center justify-center ${
              input.trim() && !isLoading
                ? "bg-primary-600 active:bg-primary-700"
                : "bg-gray-200"
            }`}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className={input.trim() ? "text-white" : "text-gray-400"}>
                ➤
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
