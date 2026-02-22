import { useState, useCallback, useRef } from "react";
import type { ComponentType } from "react";
import { AnimatedTabScreen } from "../../components/animated-tab-screen";
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
  Briefcase,
  Phone,
  Cake,
  Heart,
  Mic,
  PartyPopper,
  Users,
  BookOpen,
  Bookmark,
  CalendarDays,
  MapPin,
  Plus,
  Search,
  X,
} from "lucide-react-native";
import { Event } from "../../lib/api";
import { format, isPast } from "date-fns";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { useEvents } from "../../hooks/use-events";
import { HuskyLogo } from "../../components/HuskyLogo";

const EVENT_META: Record<
  string,
  { label: string; icon: ComponentType<{ size?: number; color?: string }> }
> = {
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

function EventsListHeader({
  search,
  onChangeSearch,
  onClearSearch,
  totalCount,
  colors,
}: {
  search: string;
  onChangeSearch: (value: string) => void;
  onClearSearch: () => void;
  totalCount: number;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View className="px-4 pt-4 pb-2 bg-background-50">
      <View className="flex-row items-center bg-background-0 rounded-2xl px-4 py-3 border border-border-200">
        <Search size={16} color={getThemeColor(colors, "typography-500")} />
        <TextInput
          className="flex-1 text-base text-typography-900 ml-2"
          placeholder="Search events"
          placeholderTextColor={getThemeColor(colors, "typography-500")}
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
          {totalCount} event{totalCount !== 1 ? "s" : ""}
        </Text>
      )}
    </View>
  );
}

export default function EventsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(text), 300);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearch("");
    clearTimeout(debounceRef.current);
    setDebouncedSearch("");
  }, []);

  const {
    data,
    isLoading,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useEvents({ search: debouncedSearch || undefined });

  const events = [
    ...new Map((data?.pages.flatMap((p) => p.events) ?? []).map((e) => [e.id, e])).values(),
  ];
  const totalCount = data?.pages[0]?.stats?.totalCount ?? 0;

  const renderEvent = ({ item }: { item: Event }) => {
    const eventDate = new Date(item.startAt);
    const isPastEvent = isPast(eventDate);
    const participantCount = item.participants?.length || 0;
    const meta = EVENT_META[item.eventType] || EVENT_META.OTHER;
    const EventIcon = meta.icon;

    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/event/[id]",
            params: { id: item.id, from: "/(tabs)/events" },
          })
        }
        className={`p-4 bg-background-0 border-b border-border-200 active:bg-background-50 ${
          isPastEvent ? "opacity-60" : ""
        }`}
      >
        <View className="flex-row">
          <View className="w-16 items-center mr-3">
            <Text className="text-xs text-typography-500 uppercase">
              {format(eventDate, "MMM")}
            </Text>
            <Text className="text-2xl font-body-bold text-typography-900">
              {format(eventDate, "d")}
            </Text>
            <Text className="text-xs text-typography-400">
              {format(eventDate, "EEE")}
            </Text>
            <Text className="text-xs text-typography-500 mt-1">
              {format(eventDate, "h:mm a")}
            </Text>
          </View>

          <View className="flex-1 border-l-2 border-primary-200 pl-3">
            <View className="flex-row items-start mb-1">
              <View className="w-7 h-7 rounded-lg bg-primary-100 items-center justify-center mr-2 mt-0.5">
                <EventIcon size={12} color={getThemeColor(colors, "primary-600")} />
              </View>
              <Text className="text-typography-900 font-body-semibold flex-1">
                {item.title}
              </Text>
            </View>

            {item.location && (
              <View className="flex-row items-center">
                <MapPin size={14} color={getThemeColor(colors, "typography-500")} />
                <Text className="text-typography-500 text-sm ml-1" numberOfLines={1}>
                  {item.location}
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

  const ListEmpty = () => (
    <View className="flex-1 items-center justify-center py-20">
      {isLoading ? (
        <ActivityIndicator size="large" color={getThemeColor(colors, "primary-600")} />
      ) : (
        <>
          <HuskyLogo size={48} color={getThemeColor(colors, "typography-300")} />
          <Text className="text-typography-900 text-lg font-body-semibold mb-2 mt-4">
            {search ? "No events found" : "No events yet"}
          </Text>
          <Text className="text-typography-500 text-center px-8">
            {search
              ? "Try a different search term"
              : "Create your first event to start tracking important dates"}
          </Text>
        </>
      )}
    </View>
  );

  const ListFooter = () =>
    isFetchingNextPage ? (
      <View className="py-4">
        <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
      </View>
    ) : null;

  return (
    <AnimatedTabScreen tabName="events">
    <View className="flex-1 bg-background-50">
      <EventsListHeader
        search={search}
        onChangeSearch={handleSearchChange}
        onClearSearch={handleClearSearch}
        totalCount={totalCount}
        colors={colors}
      />
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={renderEvent}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={ListFooter}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isFetchingNextPage}
            onRefresh={() => refetch()}
            tintColor={getThemeColor(colors, "primary-600")}
          />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.3}
        contentContainerStyle={{ flexGrow: 1 }}
      />

      <Pressable
        onPress={() => router.push("/event/new")}
        className="absolute bottom-6 right-6 w-14 h-14 bg-primary-600 rounded-full items-center justify-center shadow-lg active:bg-primary-700"
      >
        <Plus size={22} color={getThemeColor(colors, "typography-0")} />
      </Pressable>
    </View>
    </AnimatedTabScreen>
  );
}

function CalendarIcon({ color }: { color: string }) {
  return <CalendarDays size={26} color={color} />;
}
