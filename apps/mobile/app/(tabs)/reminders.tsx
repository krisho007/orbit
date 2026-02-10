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
import { Bell, CheckCircle2, XCircle, Plus } from "lucide-react-native";
import { format } from "date-fns";
import { Reminder, ReminderStatus, remindersApi } from "../../lib/api";
import { getThemeColor, useThemeColors } from "../../lib/theme";

const STATUS_META: Record<
  ReminderStatus,
  { label: string; icon: typeof Bell }
> = {
  OPEN: { label: "Open", icon: Bell },
  DONE: { label: "Done", icon: CheckCircle2 },
  CANCELED: { label: "Canceled", icon: XCircle },
};

const STATUS_FILTERS: Array<{ label: string; value?: ReminderStatus }> = [
  { label: "All" },
  { label: "Open", value: "OPEN" },
  { label: "Done", value: "DONE" },
  { label: "Canceled", value: "CANCELED" },
];

export default function RemindersScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ReminderStatus | undefined>("OPEN");
  const [totalCount, setTotalCount] = useState(0);

  const loadReminders = useCallback(
    async (refresh = false) => {
      try {
        if (refresh) {
          setIsRefreshing(true);
        }

        const data = await remindersApi.list({
          cursor: refresh ? undefined : nextCursor || undefined,
          status: statusFilter,
        });

        if (refresh) {
          setReminders(data.reminders);
        } else {
          setReminders((prev) => [...prev, ...data.reminders]);
        }

        setNextCursor(data.nextCursor);
        if (data.stats) {
          setTotalCount(data.stats.totalCount);
        }
      } catch (error) {
        console.error("Failed to load reminders:", error);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    },
    [nextCursor, statusFilter]
  );

  useEffect(() => {
    setIsLoading(true);
    setNextCursor(null);
    loadReminders(true);
  }, [statusFilter]);

  const handleRefresh = () => {
    loadReminders(true);
  };

  const handleLoadMore = () => {
    if (nextCursor && !isLoadingMore) {
      setIsLoadingMore(true);
      loadReminders(false);
    }
  };

  const renderReminder = ({ item }: { item: Reminder }) => {
    const statusMeta = STATUS_META[item.status] || STATUS_META.OPEN;
    const StatusIcon = statusMeta.icon;
    const dueDate = new Date(item.dueAt);
    const dueLabel = Number.isNaN(dueDate.getTime())
      ? "Due date unknown"
      : format(dueDate, "MMM d, yyyy");
    const iconColor =
      item.status === "DONE"
        ? getThemeColor(colors, "success-600")
        : item.status === "CANCELED"
          ? getThemeColor(colors, "error-500")
          : getThemeColor(colors, "primary-600");
    const participants =
      item.participants?.map((p) => p.contact.displayName).filter(Boolean).join(", ") ||
      "No participants";

    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/reminder/[id]",
            params: { id: item.id, from: "/(tabs)/reminders" },
          })
        }
        className="p-4 bg-background-0 border-b border-border-100 active:bg-background-50"
      >
        <View className="flex-row items-start">
          <View className="w-10 h-10 rounded-2xl bg-primary-100 items-center justify-center mr-3">
            <StatusIcon size={18} color={iconColor} />
          </View>

          <View className="flex-1">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-typography-900 font-semibold flex-1" numberOfLines={1}>
                {item.title}
              </Text>
              <Text className="text-typography-400 text-xs ml-2">{dueLabel}</Text>
            </View>

            <Text className="text-typography-600 text-sm">{participants}</Text>

            {item.notes ? (
              <Text className="text-typography-700 text-sm mt-2" numberOfLines={2}>
                {item.notes}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  const ListHeader = () => (
    <View className="bg-background-0">
      <View className="px-4 pt-4">
        <View className="flex-row flex-wrap">
          {STATUS_FILTERS.map((filter) => {
            const isActive = statusFilter === filter.value;
            return (
              <Pressable
                key={filter.label}
                onPress={() => setStatusFilter(filter.value)}
                className={`px-3 py-1.5 rounded-full mr-2 mb-2 border ${
                  isActive
                    ? "bg-primary-100 border-primary-300"
                    : "bg-background-50 border-border-200"
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    isActive ? "text-primary-700" : "text-typography-700"
                  }`}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {totalCount > 0 && (
        <View className="px-4 pb-2">
          <Text className="text-typography-500 text-sm">
            {totalCount} reminder{totalCount !== 1 ? "s" : ""}
          </Text>
        </View>
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
            <Bell size={28} color={getThemeColor(colors, "primary-600")} />
          </View>
          <Text className="text-typography-900 text-lg font-semibold mb-2">No reminders yet</Text>
          <Text className="text-typography-500 text-center px-8">
            Create reminders manually or ask the assistant to generate follow-ups.
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
        data={reminders}
        keyExtractor={(item) => item.id}
        renderItem={renderReminder}
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
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 120 }}
      />

      <View className="absolute bottom-6 right-6">
        <Pressable
          onPress={() => router.push("/reminder/new")}
          className="w-14 h-14 bg-primary-600 rounded-full items-center justify-center shadow-lg active:bg-primary-700"
        >
          <Plus size={22} color={getThemeColor(colors, "typography-0")} />
        </Pressable>
      </View>
    </View>
  );
}
