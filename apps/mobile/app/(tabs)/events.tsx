import { useEffect, useState, useCallback } from "react";
import type { ComponentType } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
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
  Bookmark,
  CalendarDays,
  MapPin,
  Plus,
} from "lucide-react-native";
import { eventsApi, Event } from "../../lib/api";
import { format, isPast } from "date-fns";
import { getThemeColor, useThemeColors } from "../../lib/theme";

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
  OTHER: { label: "Other", icon: Bookmark },
};

export default function EventsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
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
        className={`p-4 bg-background-0 border-b border-border-100 active:bg-background-50 ${
          isPastEvent ? "opacity-60" : ""
        }`}
      >
        <View className="flex-row">
          <View className="w-16 items-center mr-3">
            <Text className="text-xs text-typography-500 uppercase">
              {format(eventDate, "MMM")}
            </Text>
            <Text className="text-2xl font-bold text-typography-900">
              {format(eventDate, "d")}
            </Text>
            <Text className="text-xs text-typography-400">
              {format(eventDate, "EEE")}
            </Text>
          </View>

          <View className="flex-1 border-l-2 border-primary-200 pl-3">
            <View className="flex-row items-center mb-1">
              <View className="w-7 h-7 rounded-xl bg-primary-100 items-center justify-center mr-2">
                <EventIcon size={14} color={getThemeColor(colors, "primary-600")} />
              </View>
              <Text className="text-typography-900 font-semibold flex-1" numberOfLines={1}>
                {item.title}
              </Text>
            </View>

            <Text className="text-typography-600 text-sm mb-1">
              {format(eventDate, "h:mm a")}
              {item.endAt && ` - ${format(new Date(item.endAt), "h:mm a")}`}
            </Text>

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

  const ListHeader = () => (
    <View className="p-4 bg-background-0">
      {totalCount > 0 && (
        <Text className="text-typography-500 text-sm">
          {totalCount} event{totalCount !== 1 ? "s" : ""}
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
            <CalendarIcon color={getThemeColor(colors, "primary-600")} />
          </View>
          <Text className="text-typography-900 text-lg font-semibold mb-2">
            No events yet
          </Text>
          <Text className="text-typography-500 text-center px-8">
            Create your first event to start tracking important dates
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
            tintColor={getThemeColor(colors, "primary-600")}
          />
        }
        onEndReached={handleLoadMore}
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
  );
}

function CalendarIcon({ color }: { color: string }) {
  return <CalendarDays size={26} color={color} />;
}
