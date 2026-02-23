import type { ComponentType } from "react";
import { View, Text, FlatList, Pressable } from "react-native";
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
} from "lucide-react-native";
import { isToday, isTomorrow, format } from "date-fns";
import { getThemeColor, useThemeColors } from "../lib/theme";
import { useUpcomingEvents } from "../hooks/use-events";
import type { Event } from "../lib/api";

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
  FAMILY_EVENT: { label: "Family", icon: Users },
  JOURNAL: { label: "Journal", icon: BookOpen },
  OTHER: { label: "Other", icon: Bookmark },
};

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const time = format(date, "h:mm a");
  if (isToday(date)) return `Today, ${time}`;
  if (isTomorrow(date)) return `Tomorrow, ${time}`;
  return format(date, "MMM d, h:mm a");
}

function UpcomingEventCard({ event }: { event: Event }) {
  const router = useRouter();
  const colors = useThemeColors();
  const meta = EVENT_META[event.eventType] || EVENT_META.OTHER;
  const EventIcon = meta.icon;

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/event/[id]",
          params: { id: event.id, from: "/(tabs)/assistant" },
        })
      }
      className="bg-background-0 border border-border-200 rounded-xl p-3 mr-3 active:bg-background-50"
      style={{ width: 160 }}
    >
      <View className="flex-row items-center mb-2">
        <View className="w-7 h-7 rounded-lg bg-primary-100 items-center justify-center mr-2">
          <EventIcon size={14} color={getThemeColor(colors, "primary-600")} />
        </View>
        <Text className="text-typography-500 text-xs flex-1" numberOfLines={1}>
          {meta.label}
        </Text>
      </View>
      <Text className="text-typography-900 font-body-semibold text-sm" numberOfLines={1}>
        {event.title}
      </Text>
      <Text className="text-typography-500 text-xs mt-1" numberOfLines={1}>
        {formatRelativeDate(event.startAt)}
      </Text>
    </Pressable>
  );
}

export function UpcomingEventsWidget() {
  const { data: events, isLoading } = useUpcomingEvents();

  if (isLoading || !events || events.length === 0) return null;

  return (
    <View className="mb-4">
      <Text className="text-typography-500 text-xs font-body-semibold uppercase tracking-wide px-4 mb-2">
        Upcoming
      </Text>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        renderItem={({ item }) => <UpcomingEventCard event={item} />}
      />
    </View>
  );
}
