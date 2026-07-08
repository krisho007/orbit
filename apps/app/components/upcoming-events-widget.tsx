import type { ComponentType } from "react";
import { View, Text, FlatList, Pressable, useWindowDimensions } from "react-native";
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

function formatRelativeDate(dateStr: string): { label: string; isToday: boolean } {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return { label: "Unknown", isToday: false };
  const time = format(date, "h:mm a");
  if (isToday(date)) return { label: `Today, ${time}`, isToday: true };
  if (isTomorrow(date)) return { label: `Tomorrow, ${time}`, isToday: false };
  return { label: format(date, "MMM d, h:mm a"), isToday: false };
}

function UpcomingEventCard({ event, cardWidth }: { event: Event; cardWidth: number }) {
  const router = useRouter();
  const colors = useThemeColors();
  const meta = EVENT_META[event.eventType] || EVENT_META.OTHER;
  const EventIcon = meta.icon;
  const dateInfo = formatRelativeDate(event.startAt);

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/event/[id]",
          params: { id: event.id, from: "/(tabs)/assistant" },
        })
      }
      className="bg-background-0 border border-border-200 rounded-xl mr-2.5 active:bg-background-50"
      style={{
        width: cardWidth,
        borderLeftWidth: 3,
        borderLeftColor: getThemeColor(colors, dateInfo.isToday ? "primary-500" : "primary-200"),
      }}
    >
      <View className="px-3 py-2.5">
        {/* Title — most important */}
        <Text className="text-typography-900 font-body-semibold text-[13px] leading-[18px]" numberOfLines={1}>
          {event.title}
        </Text>
        {/* Date + type on one line */}
        <View className="flex-row items-center mt-1.5">
          <EventIcon size={11} color={getThemeColor(colors, "typography-400")} />
          <Text
            className={`text-[11px] ml-1 font-body-medium ${dateInfo.isToday ? "text-primary-600" : "text-typography-500"}`}
            numberOfLines={1}
          >
            {dateInfo.label}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function UpcomingEventsWidget() {
  const { data: events, isLoading } = useUpcomingEvents();
  const { width: screenWidth } = useWindowDimensions();
  // Show ~2.3 cards on mobile (<500px), ~3.3 on wider screens
  const cardWidth = screenWidth < 500
    ? Math.floor((screenWidth - 32 - 20) / 2.3)
    : 200;

  if (isLoading || !events || events.length === 0) return null;

  return (
    <View className="pt-1 pb-3">
      <Text className="text-typography-400 text-[11px] font-body-semibold uppercase tracking-wider px-4 mb-2">
        Upcoming
      </Text>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        renderItem={({ item }) => <UpcomingEventCard event={item} cardWidth={cardWidth} />}
      />
    </View>
  );
}
