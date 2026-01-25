import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { conversationsApi, Conversation } from "../../lib/api";
import { format } from "date-fns";

const MEDIUM_ICONS: Record<string, string> = {
  PHONE_CALL: "📞",
  WHATSAPP: "💬",
  EMAIL: "📧",
  CHANCE_ENCOUNTER: "🤝",
  ONLINE_MEETING: "💻",
  IN_PERSON_MEETING: "🏢",
  OTHER: "📝",
};

const MEDIUM_LABELS: Record<string, string> = {
  PHONE_CALL: "Phone Call",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  CHANCE_ENCOUNTER: "Chance Encounter",
  ONLINE_MEETING: "Online Meeting",
  IN_PERSON_MEETING: "In-Person Meeting",
  OTHER: "Other",
};

export default function ConversationsScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadConversations = useCallback(
    async (refresh = false) => {
      try {
        if (refresh) {
          setIsRefreshing(true);
        }

        const data = await conversationsApi.list({
          cursor: refresh ? undefined : nextCursor || undefined,
        });

        if (refresh) {
          setConversations(data.conversations);
        } else {
          setConversations((prev) => [...prev, ...data.conversations]);
        }

        setNextCursor(data.nextCursor);

        if (data.stats) {
          setTotalCount(data.stats.totalCount);
        }
      } catch (error) {
        console.error("Failed to load conversations:", error);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    },
    [nextCursor]
  );

  useEffect(() => {
    loadConversations(true);
  }, []);

  const handleRefresh = () => {
    loadConversations(true);
  };

  const handleLoadMore = () => {
    if (nextCursor && !isLoadingMore) {
      setIsLoadingMore(true);
      loadConversations(false);
    }
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const participants = item.participants?.map((p) => p.contact.displayName) || [];
    const participantText = participants.length > 0 ? participants.join(", ") : "Unknown";

    return (
      <Pressable
        onPress={() => router.push(`/conversation/${item.id}`)}
        className="p-4 bg-white border-b border-gray-100 active:bg-gray-50"
      >
        <View className="flex-row items-start">
          {/* Medium Icon */}
          <View className="w-10 h-10 rounded-full bg-primary-50 items-center justify-center mr-3">
            <Text className="text-lg">{MEDIUM_ICONS[item.medium] || "📝"}</Text>
          </View>

          {/* Content */}
          <View className="flex-1">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-gray-900 font-semibold flex-1" numberOfLines={1}>
                {participantText}
              </Text>
              <Text className="text-gray-400 text-xs ml-2">
                {format(new Date(item.happenedAt), "MMM d")}
              </Text>
            </View>

            <Text className="text-gray-500 text-sm mb-2">
              {MEDIUM_LABELS[item.medium]}
            </Text>

            {item.content && (
              <Text className="text-gray-600 text-sm" numberOfLines={2}>
                {item.content}
              </Text>
            )}

            {item.followUpAt && new Date(item.followUpAt) > new Date() && (
              <View className="flex-row items-center mt-2">
                <Text className="text-amber-600 text-xs">
                  📌 Follow-up: {format(new Date(item.followUpAt), "MMM d, yyyy")}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  const ListHeader = () => (
    <View className="p-4 bg-gray-50">
      {totalCount > 0 && (
        <Text className="text-gray-500 text-sm">
          {totalCount} conversation{totalCount !== 1 ? "s" : ""}
        </Text>
      )}
    </View>
  );

  const ListEmpty = () => (
    <View className="flex-1 items-center justify-center py-20">
      {isLoading ? (
        <ActivityIndicator size="large" color="#4F46E5" />
      ) : (
        <>
          <Text className="text-6xl mb-4">💬</Text>
          <Text className="text-gray-900 text-lg font-semibold mb-2">
            No conversations yet
          </Text>
          <Text className="text-gray-500 text-center px-8">
            Record your first conversation to keep track of your interactions
          </Text>
        </>
      )}
    </View>
  );

  const ListFooter = () =>
    isLoadingMore ? (
      <View className="py-4">
        <ActivityIndicator size="small" color="#4F46E5" />
      </View>
    ) : null;

  return (
    <View className="flex-1 bg-gray-50">
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderConversation}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={ListFooter}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#4F46E5"
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        contentContainerStyle={{ flexGrow: 1 }}
      />

      {/* FAB */}
      <Pressable
        onPress={() => router.push("/conversation/new")}
        className="absolute bottom-6 right-6 w-14 h-14 bg-primary-600 rounded-full items-center justify-center shadow-lg active:bg-primary-700"
      >
        <Text className="text-white text-2xl">+</Text>
      </Pressable>
    </View>
  );
}
