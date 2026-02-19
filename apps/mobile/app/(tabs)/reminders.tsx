import { useState, useCallback, useRef } from "react";
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
import { Bell, CheckCircle2, XCircle, Plus, Search, X } from "lucide-react-native";
import { format } from "date-fns";
import { Reminder, ReminderStatus } from "../../lib/api";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { useReminders } from "../../hooks/use-reminders";

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

function RemindersListHeader({
  search,
  onChangeSearch,
  onClearSearch,
  statusFilter,
  onChangeStatusFilter,
  totalCount,
  colors,
}: {
  search: string;
  onChangeSearch: (value: string) => void;
  onClearSearch: () => void;
  statusFilter: ReminderStatus | undefined;
  onChangeStatusFilter: (value: ReminderStatus | undefined) => void;
  totalCount: number;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View className="bg-background-50">
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row items-center bg-background-0 rounded-2xl px-4 py-3 border border-border-200">
          <Search size={16} color={getThemeColor(colors, "typography-500")} />
          <TextInput
            className="flex-1 text-base text-typography-900 ml-2"
            placeholder="Search reminders"
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
      </View>

      <View className="px-4 pb-2">
        <View className="flex-row flex-wrap">
          {STATUS_FILTERS.map((filter) => {
            const isActive = statusFilter === filter.value;
            return (
              <Pressable
                key={filter.label}
                onPress={() => onChangeStatusFilter(filter.value)}
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

      {!search && totalCount > 0 && (
        <View className="px-4 pb-2">
          <Text className="text-typography-500 text-sm">
            {totalCount} reminder{totalCount !== 1 ? "s" : ""}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function RemindersScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReminderStatus | undefined>("OPEN");
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
  } = useReminders({
    search: debouncedSearch || undefined,
    status: statusFilter,
  });

  const reminders = data?.pages.flatMap((p) => p.reminders) ?? [];
  const totalCount = data?.pages[0]?.stats?.totalCount ?? 0;

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

  const ListEmpty = () => (
    <View className="flex-1 items-center justify-center py-20">
      {isLoading ? (
        <ActivityIndicator size="large" color={getThemeColor(colors, "primary-600")} />
      ) : (
        <>
          <View className="w-16 h-16 rounded-3xl bg-primary-100 items-center justify-center mb-4">
            <Bell size={28} color={getThemeColor(colors, "primary-600")} />
          </View>
          <Text className="text-typography-900 text-lg font-semibold mb-2">
            {search ? "No reminders found" : "No reminders yet"}
          </Text>
          <Text className="text-typography-500 text-center px-8">
            {search
              ? "Try a different search term"
              : "Create reminders manually or ask the assistant to generate follow-ups."}
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
    <AnimatedTabScreen tabName="reminders">
    <View className="flex-1 bg-background-50">
      <RemindersListHeader
        search={search}
        onChangeSearch={handleSearchChange}
        onClearSearch={handleClearSearch}
        statusFilter={statusFilter}
        onChangeStatusFilter={setStatusFilter}
        totalCount={totalCount}
        colors={colors}
      />
      <FlatList
        data={reminders}
        keyExtractor={(item) => item.id}
        renderItem={renderReminder}
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
    </AnimatedTabScreen>
  );
}
