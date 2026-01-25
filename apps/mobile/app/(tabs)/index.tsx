import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { contactsApi, Contact } from "../../lib/api";

export default function ContactsScreen() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadContacts = useCallback(
    async (refresh = false) => {
      try {
        if (refresh) {
          setIsRefreshing(true);
        }

        const data = await contactsApi.list({
          search: search || undefined,
          cursor: refresh ? undefined : nextCursor || undefined,
        });

        if (refresh) {
          setContacts(data.contacts);
        } else {
          setContacts((prev) => [...prev, ...data.contacts]);
        }

        setNextCursor(data.nextCursor);

        if (data.stats) {
          setTotalCount(data.stats.totalCount);
        }
      } catch (error) {
        console.error("Failed to load contacts:", error);
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
    setContacts([]);
    setNextCursor(null);
    loadContacts(true);
  }, [search]);

  const handleRefresh = () => {
    loadContacts(true);
  };

  const handleLoadMore = () => {
    if (nextCursor && !isLoadingMore) {
      setIsLoadingMore(true);
      loadContacts(false);
    }
  };

  const renderContact = ({ item }: { item: Contact }) => (
    <Pressable
      onPress={() => router.push(`/contact/${item.id}`)}
      className="flex-row items-center p-4 bg-white border-b border-gray-100 active:bg-gray-50"
    >
      {/* Avatar */}
      <View className="w-12 h-12 rounded-full bg-primary-100 items-center justify-center mr-4">
        <Text className="text-primary-700 text-lg font-semibold">
          {item.displayName.charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* Contact Info */}
      <View className="flex-1">
        <Text className="text-gray-900 font-semibold text-base">
          {item.displayName}
        </Text>
        {(item.company || item.jobTitle) && (
          <Text className="text-gray-500 text-sm mt-0.5">
            {[item.jobTitle, item.company].filter(Boolean).join(" at ")}
          </Text>
        )}
        {item.primaryPhone && (
          <Text className="text-gray-400 text-sm">{item.primaryPhone}</Text>
        )}
      </View>

      {/* Tags */}
      {item.tags && item.tags.length > 0 && (
        <View className="flex-row">
          {item.tags.slice(0, 2).map((tag) => (
            <View
              key={tag.id}
              className="px-2 py-1 rounded-full ml-1"
              style={{ backgroundColor: tag.color + "20" }}
            >
              <Text style={{ color: tag.color }} className="text-xs font-medium">
                {tag.name}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );

  const ListHeader = () => (
    <View className="p-4 bg-gray-50">
      {/* Search Bar */}
      <View className="flex-row items-center bg-white rounded-xl px-4 py-3 border border-gray-200">
        <Text className="mr-2 text-gray-400">🔍</Text>
        <TextInput
          className="flex-1 text-base text-gray-900"
          placeholder="Search contacts..."
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Text className="text-gray-400">✕</Text>
          </Pressable>
        )}
      </View>

      {/* Stats */}
      {!search && totalCount > 0 && (
        <Text className="text-gray-500 text-sm mt-3">
          {totalCount} contact{totalCount !== 1 ? "s" : ""}
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
          <Text className="text-6xl mb-4">👥</Text>
          <Text className="text-gray-900 text-lg font-semibold mb-2">
            {search ? "No contacts found" : "No contacts yet"}
          </Text>
          <Text className="text-gray-500 text-center px-8">
            {search
              ? "Try a different search term"
              : "Add your first contact to get started"}
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
        data={contacts}
        keyExtractor={(item) => item.id}
        renderItem={renderContact}
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
        onPress={() => router.push("/contact/new")}
        className="absolute bottom-6 right-6 w-14 h-14 bg-primary-600 rounded-full items-center justify-center shadow-lg active:bg-primary-700"
      >
        <Text className="text-white text-2xl">+</Text>
      </Pressable>
    </View>
  );
}
