import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Image,
  Linking,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Search,
  X,
  Plus,
  Users,
  Download,
  Phone,
} from "lucide-react-native";
import Svg, { Path } from "react-native-svg";
import { contactsApi, Contact } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { getThemeColor, useThemeColors, type ThemeColors } from "../../lib/theme";

function WhatsAppIcon({ size = 20, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </Svg>
  );
}

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

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsApp = (phone: string) => {
    const cleaned = phone.replace(/[^0-9+]/g, "").replace(/^\+/, "");
    Linking.openURL(`https://wa.me/${cleaned}`).catch(() => {
      Alert.alert("WhatsApp not available", "Could not open WhatsApp for this number.");
    });
  };

  const renderContact = ({ item }: { item: Contact }) => (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/contact/[id]",
          params: { id: item.id, from: "/(tabs)/index" },
        })
      }
      className="flex-row items-center px-4 py-4 bg-background-0 border border-border-100 rounded-2xl mx-4 mb-3 active:bg-background-50"
    >
      {item.images?.[0]?.imageUrl ? (
        <Image
          source={{ uri: item.images[0].imageUrl }}
          className="w-12 h-12 rounded-2xl mr-4"
        />
      ) : (
        <View className="w-12 h-12 rounded-2xl bg-primary-100 items-center justify-center mr-4">
          <Text className="text-primary-700 text-lg font-semibold">
            {item.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

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

      {item.primaryPhone && (
        <View className="flex-row items-center gap-5 ml-3">
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              handleWhatsApp(item.primaryPhone!);
            }}
            hitSlop={8}
            className="active:opacity-50"
          >
            <WhatsAppIcon size={22} color="#25D366" />
          </Pressable>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              handleCall(item.primaryPhone!);
            }}
            hitSlop={8}
            className="active:opacity-50"
          >
            <Phone size={22} color={getThemeColor(colors, "primary-600")} />
          </Pressable>
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
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 140 }}
      />

      <View className="absolute bottom-6 right-6 items-center">
        <Pressable
          onPress={() => router.push("/contact/new")}
          className="w-14 h-14 bg-primary-600 rounded-full items-center justify-center shadow-lg active:bg-primary-700 mb-3"
        >
          <Plus size={22} color={getThemeColor(colors, "typography-0")} />
        </Pressable>

        <Pressable
          onPress={() =>
            router.push({
              pathname: "/google-import" as any,
              params: { entry: "contacts" },
            })
          }
          className="w-12 h-12 bg-background-0 border border-border-200 rounded-full items-center justify-center shadow-sm active:bg-background-50"
        >
          <Download size={18} color={getThemeColor(colors, "primary-600")} />
        </Pressable>
      </View>
    </View>
  );
}
