import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import {
  Bell,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  Pencil,
  Trash2,
  Calendar,
  StickyNote,
  Repeat,
  Link,
  User,
} from "lucide-react-native";
import { Reminder, ReminderStatus, remindersApi } from "../../lib/api";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { useDeleteReminder } from "../../hooks/use-reminders";
import { useConfirmDialog } from "../../components/confirm-dialog";

const STATUS_META: Record<ReminderStatus, { label: string; icon: typeof Bell }> = {
  OPEN: { label: "Open", icon: Bell },
  DONE: { label: "Done", icon: CheckCircle2 },
  CANCELED: { label: "Canceled", icon: XCircle },
};

const STATUS_COLORS: Record<ReminderStatus, { icon: string; bg: string; pill: string; pillText: string }> = {
  OPEN: { icon: "primary-600", bg: "bg-primary-100", pill: "bg-primary-100", pillText: "text-primary-700" },
  DONE: { icon: "success-600", bg: "bg-success-100", pill: "bg-success-100", pillText: "text-success-700" },
  CANCELED: { icon: "error-500", bg: "bg-error-100", pill: "bg-error-100", pillText: "text-error-700" },
};

function getRecurrenceLabel(reminder: Reminder): string {
  if (reminder.recurrence === "NONE") {
    return "One-time reminder";
  }

  const unitMap = {
    DAILY: "day",
    WEEKLY: "week",
    MONTHLY: "month",
    YEARLY: "year",
  } as const;

  const unit = unitMap[reminder.recurrence];
  const interval = reminder.recurrenceInterval || 1;
  const cadence =
    interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;

  if (!reminder.recurrenceEndsAt) {
    return cadence;
  }

  const endsAt = new Date(reminder.recurrenceEndsAt);
  if (Number.isNaN(endsAt.getTime())) {
    return cadence;
  }

  return `${cadence} until ${format(endsAt, "MMM d, yyyy h:mm a")}`;
}

export default function ReminderDetailScreen() {
  const router = useRouter();
  const { id, from } = useLocalSearchParams<{
    id: string;
    from?: string | string[];
  }>();
  const colors = useThemeColors();
  const backHref = Array.isArray(from) ? from[0] : from;
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const deleteReminder = useDeleteReminder();
  const { confirm, ConfirmDialogElement } = useConfirmDialog();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace((backHref || "/(tabs)/index") as any);
  }, [backHref, router]);

  useEffect(() => {
    loadReminder();
  }, [id]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleBack]);

  const loadReminder = async () => {
    try {
      setIsLoading(true);
      const data = await remindersApi.get(id);
      setReminder(data);
    } catch (error) {
      console.error("Failed to load reminder:", error);
      Alert.alert("Error", "Failed to load reminder details");
      handleBack();
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (status: ReminderStatus) => {
    if (!reminder) return;
    try {
      setIsSaving(true);
      await remindersApi.update(reminder.id, { status });
      await loadReminder();
    } catch (error) {
      console.error("Failed to update reminder status:", error);
      Alert.alert("Error", "Failed to update reminder");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!reminder) return;
    const confirmed = await confirm({
      title: "Delete Reminder",
      message: "Are you sure you want to delete this reminder?",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteReminder.mutateAsync(reminder.id);
      handleBack();
    } catch (error) {
      console.error("Failed to delete reminder:", error);
      Alert.alert("Error", "Failed to delete reminder");
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background-0">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={getThemeColor(colors, "primary-600")} />
        </View>
      </SafeAreaView>
    );
  }

  if (!reminder) {
    return (
      <SafeAreaView className="flex-1 bg-background-0">
        <View className="flex-1 items-center justify-center">
          <Text className="text-typography-500">Reminder not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusMeta = STATUS_META[reminder.status] || STATUS_META.OPEN;
  const statusColors = STATUS_COLORS[reminder.status] || STATUS_COLORS.OPEN;
  const StatusIcon = statusMeta.icon;
  const statusIconColor = getThemeColor(colors, statusColors.icon as any);
  const dueDate = new Date(reminder.dueAt);
  const dueLabel = Number.isNaN(dueDate.getTime())
    ? "Due date unknown"
    : format(dueDate, "MMMM d, yyyy");
  const participants =
    reminder.participants?.map((p) => p.contact) || [];
  const recurrenceLabel = getRecurrenceLabel(reminder);

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={handleBack} className="p-2">
          <ChevronLeft size={22} color={getThemeColor(colors, "primary-600")} />
        </Pressable>
        <Text className="text-lg font-body-semibold text-typography-900">Reminder</Text>
        <View className="flex-row items-center">
          <Pressable onPress={handleDelete} className="p-2 mr-1">
            <Trash2 size={20} color={getThemeColor(colors, "error-500")} />
          </Pressable>
          <Pressable onPress={() => router.push(`/reminder/${id}/edit`)} className="p-2">
            <Pencil size={20} color={getThemeColor(colors, "primary-600")} />
          </Pressable>
        </View>
      </View>

      <ScrollView className="flex-1">
        {/* Hero Section */}
        <View className="items-center py-8">
          <View className={`w-16 h-16 rounded-2xl ${statusColors.bg} items-center justify-center mb-4`}>
            <StatusIcon size={28} color={statusIconColor} />
          </View>
          <Text className="text-2xl font-heading-bold text-typography-900 mb-1 text-center px-4">
            {reminder.title}
          </Text>
          <Text className="text-typography-500 text-base mb-3">{dueLabel}</Text>
          <View className={`px-3 py-1.5 rounded-full ${statusColors.pill}`}>
            <Text className={`text-sm font-body-medium ${statusColors.pillText}`}>
              {statusMeta.label}
            </Text>
          </View>
        </View>

        {/* Consolidated Details Card */}
        {(() => {
          const rows: React.ReactNode[] = [];

          if (reminder.notes) {
            rows.push(
              <View key="notes" className="flex-row items-start px-4 py-3">
                <StickyNote size={16} color={getThemeColor(colors, "typography-400")} />
                <View className="ml-3 flex-1">
                  <Text className="text-typography-400 text-xs">Notes</Text>
                  <Text className="text-typography-900 text-base" numberOfLines={3}>
                    {reminder.notes}
                  </Text>
                </View>
              </View>
            );
          }

          rows.push(
            <View key="recurrence" className="flex-row items-center px-4 py-3">
              <Repeat size={16} color={getThemeColor(colors, "typography-400")} />
              <View className="ml-3 flex-1">
                <Text className="text-typography-400 text-xs">Recurrence</Text>
                <Text className="text-typography-900 text-base">{recurrenceLabel}</Text>
              </View>
            </View>
          );

          if (reminder.dueAt) {
            rows.push(
              <View key="due" className="flex-row items-center px-4 py-3">
                <Calendar size={16} color={getThemeColor(colors, "typography-400")} />
                <View className="ml-3 flex-1">
                  <Text className="text-typography-400 text-xs">Due Date & Time</Text>
                  <Text className="text-typography-900 text-base">
                    {Number.isNaN(dueDate.getTime())
                      ? "Unknown"
                      : format(dueDate, "MMM d, yyyy h:mm a")}
                  </Text>
                </View>
              </View>
            );
          }

          if (participants.length > 0) {
            participants.forEach((contact) => {
              rows.push(
                <Pressable
                  key={`contact-${contact.id}`}
                  onPress={() => router.push(`/contact/${contact.id}`)}
                  className="flex-row items-center px-4 py-3 active:bg-background-100"
                >
                  <User size={16} color={getThemeColor(colors, "typography-400")} />
                  <View className="ml-3 flex-1">
                    <Text className="text-typography-400 text-xs">Contact</Text>
                    <Text className="text-typography-900 text-base">{contact.displayName}</Text>
                  </View>
                </Pressable>
              );
            });
          }

          if (reminder.conversation) {
            rows.push(
              <Pressable
                key="conversation"
                onPress={() => router.push(`/conversation/${reminder.conversation!.id}`)}
                className="flex-row items-center px-4 py-3 active:bg-background-100"
              >
                <Link size={16} color={getThemeColor(colors, "typography-400")} />
                <View className="ml-3 flex-1">
                  <Text className="text-typography-400 text-xs">Linked Conversation</Text>
                  <Text className="text-typography-900 text-base">
                    {reminder.conversation.medium.replace(/_/g, " ")} &middot;{" "}
                    {format(new Date(reminder.conversation.happenedAt), "MMM d, yyyy")}
                  </Text>
                </View>
              </Pressable>
            );
          }

          if (rows.length === 0) return null;

          return (
            <View className="mx-4 mb-2 rounded-xl bg-background-50 border border-border-200 overflow-hidden">
              {rows.map((row, i) => (
                <View key={i}>
                  {i > 0 && <View className="border-b border-border-200 mx-4" />}
                  {row}
                </View>
              ))}
            </View>
          );
        })()}

        {/* Participants — empty state */}
        {participants.length === 0 && (
          <View className="px-4 mt-6">
            <View className="flex-row items-center py-2">
              <User size={16} color={getThemeColor(colors, "typography-400")} />
              <Text className="text-typography-400 text-sm ml-2">No participants yet</Text>
            </View>
          </View>
        )}

        {/* Status Buttons */}
        <View className="px-4 mt-6">
          <Text className="text-typography-500 text-sm font-body-medium mb-3">Status</Text>
          <View className="flex-row flex-wrap">
            <Pressable
              disabled={isSaving}
              onPress={() => updateStatus("OPEN")}
              className={`px-3 py-2 rounded-full mr-2 mb-2 border ${
                reminder.status === "OPEN"
                  ? "bg-primary-100 border-primary-300"
                  : "bg-background-50 border-border-200"
              }`}
            >
              <Text
                className={`text-sm font-body-medium ${
                  reminder.status === "OPEN" ? "text-primary-700" : "text-typography-700"
                }`}
              >
                Open
              </Text>
            </Pressable>

            <Pressable
              disabled={isSaving}
              onPress={() => updateStatus("DONE")}
              className={`px-3 py-2 rounded-full mr-2 mb-2 border ${
                reminder.status === "DONE"
                  ? "bg-success-100 border-success-300"
                  : "bg-background-50 border-border-200"
              }`}
            >
              <Text
                className={`text-sm font-body-medium ${
                  reminder.status === "DONE" ? "text-success-700" : "text-typography-700"
                }`}
              >
                Done
              </Text>
            </Pressable>

            <Pressable
              disabled={isSaving}
              onPress={() => updateStatus("CANCELED")}
              className={`px-3 py-2 rounded-full mr-2 mb-2 border ${
                reminder.status === "CANCELED"
                  ? "bg-error-100 border-error-300"
                  : "bg-background-50 border-border-200"
              }`}
            >
              <Text
                className={`text-sm font-body-medium ${
                  reminder.status === "CANCELED" ? "text-error-700" : "text-typography-700"
                }`}
              >
                Canceled
              </Text>
            </Pressable>
          </View>
        </View>

        <View className="h-8" />
      </ScrollView>

      {ConfirmDialogElement}
    </SafeAreaView>
  );
}
