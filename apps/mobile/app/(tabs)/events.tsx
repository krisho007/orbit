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
import { eventsApi, Event } from "../../lib/api";
import { format, isToday, isTomorrow, isPast } from "date-fns";

const EVENT_TYPE_ICONS: Record<string, string> = {
  MEETING: "📋",
  CALL: "📞",
  BIRTHDAY: "🎂",
  ANNIVERSARY: "💍",
  CONFERENCE: "🎤",
  SOCIAL: "🎉",
  FAMILY_EVENT: "👨‍👩‍👧‍👦",
  OTHER: "📌",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  MEETING: "Meeting",
  CALL: "Call",
  BIRTHDAY: "Birthday",
  ANNIVERSARY: "Anniversary",
  CONFERENCE: "Conference",
  SOCIAL: "Social",
  FAMILY_EVENT: "Family Event",
  OTHER: "Other",
};

export default function EventsScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadEvents = useCallback(
    async (refresh = false) => {
      try {
        if (refresh) {
          setIsRefreshing(true);
        }

        const data = await eventsApi.list({
          cursor: refresh ? undefined : nextCursor || undefined,
        });

        if (refresh) {
          setEvents(data.events);
        } else {
          setEvents((prev) => [...prev, ...data.events]);
        }

        setNextCursor(data.nextCursor);

        if (data.stats) {
          setTotalCount(data.stats.totalCount);
        }
      } catch (error) {
        console.error("Failed to load events:", error);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    },
    [nextCursor]
  );

  useEffect(() => {
    loadEvents(true);
  }, []);

  const handleRefresh = () => {
    loadEvents(true);
  };

  const handleLoadMore = () => {
    if (nextCursor && !isLoadingMore) {
      setIsLoadingMore(true);
      loadEvents(false);
    }
  };

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    return format(date, "MMM d, yyyy");
  };

  const renderEvent = ({ item }: { item: Event }) => {
    const eventDate = new Date(item.startAt);
    const isPastEvent = isPast(eventDate);
    const participantCount = item.participants?.length || 0;

    return (
      <Pressable
        onPress={() => router.push(`/event/${item.id}`)}
        className={`p-4 bg-white border-b border-gray-100 active:bg-gray-50 ${
          isPastEvent ? "opacity-60" : ""
        }`}
      >
        <View className="flex-row">
          {/* Date Column */}
          <View className="w-16 items-center mr-3">
            <Text className="text-xs text-gray-500 uppercase">
              {format(eventDate, "MMM")}
            </Text>
            <Text className="text-2xl font-bold text-gray-900">
              {format(eventDate, "d")}
            </Text>
            <Text className="text-xs text-gray-400">
              {format(eventDate, "EEE")}
            </Text>
          </View>

          {/* Event Details */}
          <View className="flex-1 border-l-2 border-primary-200 pl-3">
            <View className="flex-row items-center mb-1">
              <Text className="mr-2">
                {EVENT_TYPE_ICONS[item.eventType] || "📌"}
              </Text>
              <Text className="text-gray-900 font-semibold flex-1" numberOfLines={1}>
                {item.title}
              </Text>
            </View>

            <Text className="text-gray-500 text-sm mb-1">
              {format(eventDate, "h:mm a")}
              {item.endAt && ` - ${format(new Date(item.endAt), "h:mm a")}`}
            </Text>

            {item.location && (
              <Text className="text-gray-400 text-sm" numberOfLines={1}>
                📍 {item.location}
              </Text>
            )}

            {participantCount > 0 && (
              <Text className="text-gray-400 text-sm mt-1">
                👥 {participantCount} participant{participantCount !== 1 ? "s" : ""}
              </Text>
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
          {totalCount} event{totalCount !== 1 ? "s" : ""}
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
          <Text className="text-6xl mb-4">📅</Text>
          <Text className="text-gray-900 text-lg font-semibold mb-2">
            No events yet
          </Text>
          <Text className="text-gray-500 text-center px-8">
            Create your first event to start tracking important dates
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
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={renderEvent}
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
        onPress={() => router.push("/event/new")}
        className="absolute bottom-6 right-6 w-14 h-14 bg-primary-600 rounded-full items-center justify-center shadow-lg active:bg-primary-700"
      >
        <Text className="text-white text-2xl">+</Text>
      </Pressable>
    </View>
  );
}
