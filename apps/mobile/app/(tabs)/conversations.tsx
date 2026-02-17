import { useEffect, useState, useCallback } from "react";
import { AnimatedTabScreen } from "../../components/animated-tab-screen";
import type { ComponentType } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Phone,
  MessageCircle,
  Mail,
  Handshake,
  Monitor,
  Building2,
  FileText,
  Plus,
  Search,
  X,
} from "lucide-react-native";
import { conversationsApi, Conversation } from "../../lib/api";
import { format } from "date-fns";
import { getThemeColor, useThemeColors } from "../../lib/theme";

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

export default function ConversationsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState("");
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
          search: search || undefined,
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
    [search, nextCursor]
  );

  useEffect(() => {
    setIsLoading(true);
    setConversations([]);
    setNextCursor(null);
    loadConversations(true);
  }, [search]);

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
    const medium = MEDIUM_META[item.medium] || MEDIUM_META.OTHER;
    const MediumIcon = medium.icon;

    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/conversation/[id]",
            params: { id: item.id, from: "/(tabs)/conversations" },
          })
        }
        className="p-4 bg-background-0 border-b border-border-100 active:bg-background-50"
      >
        <View className="flex-row items-start">
          <View className="w-10 h-10 rounded-2xl bg-primary-100 items-center justify-center mr-3">
            <MediumIcon size={18} color={getThemeColor(colors, "primary-600")} />
          </View>

          <View className="flex-1">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-typography-900 font-semibold flex-1" numberOfLines={1}>
                {participantText}
              </Text>
              <Text className="text-typography-400 text-xs ml-2">
                {format(new Date(item.happenedAt), "MMM d")}
              </Text>
            </View>

            <Text className="text-typography-600 text-sm mb-2">{medium.label}</Text>

            {item.content && (
              <Text className="text-typography-700 text-sm" numberOfLines={2}>
                {item.content}
              </Text>
            )}

            {item.followUpAt && new Date(item.followUpAt) > new Date() && (
              <View className="flex-row items-center mt-2">
                <Text className="text-secondary-600 text-xs">
                  Follow-up: {format(new Date(item.followUpAt), "MMM d, yyyy")}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  const ListHeader = () => (
    <View className="px-4 pt-4 pb-2 bg-background-50">
      <View className="flex-row items-center bg-background-0 rounded-2xl px-4 py-3 border border-border-200">
        <Search size={16} color={getThemeColor(colors, "typography-500")} />
        <TextInput
          className="flex-1 text-base text-typography-900 ml-2"
          placeholder="Search conversations"
          placeholderTextColor={getThemeColor(colors, "typography-500")}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} className="ml-2">
            <X size={16} color={getThemeColor(colors, "typography-500")} />
          </Pressable>
        )}
      </View>

      {!search && totalCount > 0 && (
        <Text className="text-typography-500 text-sm mt-3">
          {totalCount} conversation{totalCount !== 1 ? "s" : ""}
        </Text>
      )}
    </View>
  );

  const ListEmpty = () => (
    <View className="flex-1 items-center justify-center py-20">
      {isLoading ? (
        <ActivityIndicator size="large" color={getThemeColor(colors, "primary-600")} />
      ) : (
        <>
          <View className="w-16 h-16 rounded-3xl bg-primary-100 items-center justify-center mb-4">
            <MessageCircle size={28} color={getThemeColor(colors, "primary-600")} />
          </View>
          <Text className="text-typography-900 text-lg font-semibold mb-2">
            {search ? "No conversations found" : "No conversations yet"}
          </Text>
          <Text className="text-typography-500 text-center px-8">
            {search
              ? "Try a different search term"
              : "Record your first conversation to keep track of your interactions"}
          </Text>
        </>
      )}
    </View>
  );

  const ListFooter = () =>
    isLoadingMore ? (
      <View className="py-4">
        <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
      </View>
    ) : null;

  return (
    <AnimatedTabScreen tabName="conversations">
    <View className="flex-1 bg-background-50">
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
            tintColor={getThemeColor(colors, "primary-600")}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        contentContainerStyle={{ flexGrow: 1 }}
      />

      <Pressable
        onPress={() => router.push("/conversation/new")}
        className="absolute bottom-6 right-6 w-14 h-14 bg-primary-600 rounded-full items-center justify-center shadow-lg active:bg-primary-700"
      >
        <Plus size={22} color={getThemeColor(colors, "typography-0")} />
      </Pressable>
    </View>
    </AnimatedTabScreen>
  );
}
