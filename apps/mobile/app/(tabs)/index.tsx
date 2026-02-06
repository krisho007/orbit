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
import { useRouter } from "expo-router";
import { Search, X, Plus, Users } from "lucide-react-native";
import { contactsApi, Contact } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { getThemeColor, useThemeColors, type ThemeColors } from "../../lib/theme";

function ContactsListHeader({
  search,
  onChangeSearch,
  totalCount,
  onClearSearch,
  colors,
}: {
  search: string;
  onChangeSearch: (value: string) => void;
  totalCount: number;
  onClearSearch: () => void;
  colors: ThemeColors;
}) {
  const placeholderColor = getThemeColor(colors, "typography-500");

  return (
    <View className="px-4 pt-4 pb-2 bg-background-50">
      <View className="flex-row items-center bg-background-0 rounded-2xl px-4 py-3 border border-border-200">
        <Search size={16} color={getThemeColor(colors, "typography-500")} />
        <TextInput
          className="flex-1 text-base text-typography-900 ml-2"
          placeholder="Search contacts"
          placeholderTextColor={placeholderColor}
          value={search}
          onChangeText={onChangeSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={onClearSearch} className="ml-2">
            <X size={16} color={getThemeColor(colors, "typography-500")} />
          </Pressable>
        )}
      </View>

      {!search && totalCount > 0 && (
        <Text className="text-typography-500 text-sm mt-3">
          {totalCount} contact{totalCount !== 1 ? "s" : ""}
        </Text>
      )}
    </View>
  );
}

export default function ContactsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const colors = useThemeColors();
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
    if (!session) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setContacts([]);
    setNextCursor(null);
    loadContacts(true);
  }, [search, session]);

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
      className="flex-row items-center px-4 py-4 bg-background-0 border border-border-100 rounded-2xl mx-4 mb-3 active:bg-background-50"
    >
      <View className="w-12 h-12 rounded-2xl bg-primary-100 items-center justify-center mr-4">
        <Text className="text-primary-700 text-lg font-semibold">
          {item.displayName.charAt(0).toUpperCase()}
        </Text>
      </View>

      <View className="flex-1">
        <Text className="text-typography-900 font-semibold text-base">
          {item.displayName}
        </Text>
        {(item.company || item.jobTitle) && (
          <Text className="text-typography-600 text-sm mt-0.5">
            {[item.jobTitle, item.company].filter(Boolean).join(" at ")}
          </Text>
        )}
        {item.primaryPhone && (
          <Text className="text-typography-500 text-sm">{item.primaryPhone}</Text>
        )}
      </View>

      {item.tags && item.tags.length > 0 && (
        <View className="flex-row">
          {item.tags.slice(0, 2).map((tag) => (
            <View
              key={tag.id}
              className="px-2 py-1 rounded-full ml-1"
              style={{ backgroundColor: tag.color + "22" }}
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

  const ListEmpty = () => (
    <View className="flex-1 items-center justify-center py-20">
      {isLoading ? (
        <ActivityIndicator size="large" color={getThemeColor(colors, "primary-600")} />
      ) : (
        <>
          <View className="w-16 h-16 rounded-3xl bg-primary-100 items-center justify-center mb-4">
            <Users size={28} color={getThemeColor(colors, "primary-600")} />
          </View>
          <Text className="text-typography-900 text-lg font-semibold mb-2">
            {search ? "No contacts found" : "No contacts yet"}
          </Text>
          <Text className="text-typography-500 text-center px-8">
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
        <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
      </View>
    ) : null;

  return (
    <View className="flex-1 bg-background-50">
      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        renderItem={renderContact}
        ListHeaderComponent={
          <ContactsListHeader
            search={search}
            onChangeSearch={setSearch}
            totalCount={totalCount}
            onClearSearch={() => setSearch("")}
            colors={colors}
          />
        }
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
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 96 }}
      />

      <Pressable
        onPress={() => router.push("/contact/new")}
        className="absolute bottom-6 right-6 w-14 h-14 bg-primary-600 rounded-full items-center justify-center shadow-lg active:bg-primary-700"
      >
        <Plus size={22} color={getThemeColor(colors, "typography-0")} />
      </Pressable>
    </View>
  );
}
