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
} from "lucide-react-native";
import { Reminder, ReminderStatus, remindersApi } from "../../lib/api";
import { getThemeColor, useThemeColors } from "../../lib/theme";

const STATUS_META: Record<ReminderStatus, { label: string; icon: typeof Bell }> = {
  OPEN: { label: "Open", icon: Bell },
  DONE: { label: "Done", icon: CheckCircle2 },
  CANCELED: { label: "Canceled", icon: XCircle },
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

  const handleBack = useCallback(() => {
    if (backHref) {
      router.replace(backHref as any);
      return;
    }
    router.back();
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
    Alert.alert("Delete Reminder", "Are you sure you want to delete this reminder?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await remindersApi.delete(reminder.id);
            handleBack();
          } catch (error) {
            console.error("Failed to delete reminder:", error);
            Alert.alert("Error", "Failed to delete reminder");
          }
        },
      },
    ]);
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
  const StatusIcon = statusMeta.icon;
  const statusColor =
    reminder.status === "DONE"
      ? getThemeColor(colors, "success-600")
      : reminder.status === "CANCELED"
        ? getThemeColor(colors, "error-500")
        : getThemeColor(colors, "primary-600");
  const dueDate = new Date(reminder.dueAt);
  const dueLabel = Number.isNaN(dueDate.getTime())
    ? "Due date unknown"
    : format(dueDate, "MMM d, yyyy h:mm a");
  const participants =
    reminder.participants?.map((p) => p.contact.displayName).filter(Boolean) || [];
  const recurrenceLabel = getRecurrenceLabel(reminder);

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-200">
        <Pressable onPress={handleBack} className="p-2">
          <ChevronLeft size={22} color={getThemeColor(colors, "primary-600")} />
        </Pressable>
        <Text className="text-lg font-semibold text-typography-900">Reminder</Text>
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
        <View className="px-4 py-6 border-b border-border-200">
          <View className="flex-row items-center">
            <View className="w-12 h-12 rounded-2xl bg-primary-100 items-center justify-center mr-3">
              <StatusIcon size={20} color={statusColor} />
            </View>
            <View className="flex-1">
              <Text className="text-typography-900 text-lg font-semibold">{reminder.title}</Text>
              <Text className="text-typography-500 text-sm mt-1">
                {statusMeta.label} · {dueLabel}
              </Text>
            </View>
          </View>
        </View>

        {reminder.notes && (
          <View className="px-4 py-6 border-b border-border-200">
            <Text className="text-typography-500 text-sm font-medium mb-2">Notes</Text>
            <View className="bg-background-50 rounded-lg p-4">
              <Text className="text-typography-900 text-base">{reminder.notes}</Text>
            </View>
          </View>
        )}

        <View className="px-4 py-6 border-b border-border-200">
          <Text className="text-typography-500 text-sm font-medium mb-2">Participants</Text>
          {participants.length > 0 ? (
            <View className="flex-row flex-wrap">
              {participants.map((name) => (
                <View key={name} className="px-3 py-1.5 rounded-full bg-primary-50 mr-2 mb-2">
                  <Text className="text-primary-700 text-sm font-medium">{name}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text className="text-typography-500 text-sm">No participants linked.</Text>
          )}
        </View>

        <View className="px-4 py-6 border-b border-border-200">
          <Text className="text-typography-500 text-sm font-medium mb-2">Recurrence</Text>
          <Text className="text-typography-900 text-base">{recurrenceLabel}</Text>
        </View>

        {reminder.conversation && (
          <View className="px-4 py-6 border-b border-border-200">
            <Text className="text-typography-500 text-sm font-medium mb-2">Linked Conversation</Text>
            <Pressable
              onPress={() => router.push(`/conversation/${reminder.conversation!.id}`)}
              className="rounded-lg border border-border-200 bg-background-50 p-4 active:bg-background-100"
            >
              <Text className="text-typography-900 font-medium">
                {reminder.conversation.medium.replace(/_/g, " ")}
              </Text>
              <Text className="text-typography-500 text-sm mt-1">
                {format(new Date(reminder.conversation.happenedAt), "MMM d, yyyy")}
              </Text>
            </Pressable>
          </View>
        )}

        <View className="px-4 py-6">
          <Text className="text-typography-500 text-sm font-medium mb-3">Status</Text>
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
                className={`text-sm font-medium ${
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
                className={`text-sm font-medium ${
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
                className={`text-sm font-medium ${
                  reminder.status === "CANCELED" ? "text-error-700" : "text-typography-700"
                }`}
              >
                Canceled
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
