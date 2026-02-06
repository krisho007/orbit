import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import {
  Contact,
  ReminderRecurrence,
  ReminderStatus,
  contactsApi,
  remindersApi,
} from "../../lib/api";
import { getThemeColor, useThemeColors } from "../../lib/theme";

function formatDateInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd HH:mm");
}

function parseDateInput(value: string): string | null {
  const normalized = value.trim().replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

const STATUS_OPTIONS: ReminderStatus[] = ["OPEN", "DONE", "CANCELED"];
const RECURRENCE_OPTIONS: Array<{ value: ReminderRecurrence; label: string }> = [
  { value: "NONE", label: "One-time" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];

export default function NewReminderScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const placeholderColor = getThemeColor(colors, "typography-500");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    title: "",
    notes: "",
    dueAt: formatDateInput(new Date(Date.now() + 60 * 60 * 1000).toISOString()),
    status: "OPEN" as ReminderStatus,
    recurrence: "NONE" as ReminderRecurrence,
    recurrenceInterval: "1",
    recurrenceEndsAt: "",
  });

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      setIsLoadingContacts(true);
      const data = await contactsApi.list({ limit: 100 });
      setContacts(data.contacts);
    } catch (error) {
      console.error("Failed to load contacts:", error);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const toggleParticipant = (contactId: string) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId]
    );
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      Alert.alert("Error", "Title is required");
      return;
    }

    const dueAt = parseDateInput(formData.dueAt);
    if (!dueAt) {
      Alert.alert("Error", "Enter a valid due date/time");
      return;
    }

    const recurrenceInterval = Number.parseInt(formData.recurrenceInterval.trim(), 10);
    if (formData.recurrence !== "NONE" && (!Number.isInteger(recurrenceInterval) || recurrenceInterval < 1)) {
      Alert.alert("Error", "Recurrence interval must be a whole number greater than 0");
      return;
    }

    const recurrenceEndsAt = formData.recurrenceEndsAt.trim()
      ? parseDateInput(formData.recurrenceEndsAt)
      : null;
    if (formData.recurrenceEndsAt.trim() && !recurrenceEndsAt) {
      Alert.alert("Error", "Enter a valid recurrence end date/time");
      return;
    }

    try {
      setIsSubmitting(true);
      const created = await remindersApi.create({
        title: formData.title.trim(),
        notes: formData.notes.trim() || undefined,
        dueAt,
        status: formData.status,
        recurrence: formData.recurrence,
        recurrenceInterval: formData.recurrence === "NONE" ? 1 : recurrenceInterval,
        recurrenceEndsAt:
          formData.recurrence === "NONE" ? null : recurrenceEndsAt || null,
        participantIds: selectedParticipantIds.length > 0 ? selectedParticipantIds : undefined,
      });
      router.replace(`/reminder/${created.id}`);
    } catch (error) {
      console.error("Failed to create reminder:", error);
      Alert.alert("Error", "Failed to create reminder");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-200">
        <Pressable onPress={() => router.back()} className="p-2">
          <Text className="text-primary-600 text-base">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-semibold text-typography-900">New Reminder</Text>
        <Pressable onPress={handleSubmit} disabled={isSubmitting} className="p-2">
          <Text
            className={`text-base ${
              isSubmitting ? "text-typography-400" : "text-primary-600"
            }`}
          >
            {isSubmitting ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4 py-6">
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Title *</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="Reminder title"
            placeholderTextColor={placeholderColor}
            value={formData.title}
            onChangeText={(text) => setFormData({ ...formData, title: text })}
          />
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Due At *</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="YYYY-MM-DD HH:mm"
            placeholderTextColor={placeholderColor}
            value={formData.dueAt}
            onChangeText={(text) => setFormData({ ...formData, dueAt: text })}
          />
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Status</Text>
          <View className="flex-row flex-wrap">
            {STATUS_OPTIONS.map((status) => {
              const isActive = formData.status === status;
              return (
                <Pressable
                  key={status}
                  onPress={() => setFormData({ ...formData, status })}
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
                    {status}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Recurrence</Text>
          <View className="flex-row flex-wrap">
            {RECURRENCE_OPTIONS.map((option) => {
              const isActive = formData.recurrence === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setFormData({ ...formData, recurrence: option.value })}
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
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {formData.recurrence !== "NONE" && (
          <>
            <View className="mb-4">
              <Text className="text-typography-700 text-sm font-medium mb-2">Repeat Every *</Text>
              <TextInput
                className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
                placeholder="1"
                placeholderTextColor={placeholderColor}
                value={formData.recurrenceInterval}
                onChangeText={(text) => setFormData({ ...formData, recurrenceInterval: text })}
                keyboardType="number-pad"
              />
              <Text className="text-typography-500 text-xs mt-1">
                Example: 2 with weekly means every 2 weeks.
              </Text>
            </View>

            <View className="mb-4">
              <Text className="text-typography-700 text-sm font-medium mb-2">Repeat Until</Text>
              <TextInput
                className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
                placeholder="YYYY-MM-DD HH:mm (optional)"
                placeholderTextColor={placeholderColor}
                value={formData.recurrenceEndsAt}
                onChangeText={(text) => setFormData({ ...formData, recurrenceEndsAt: text })}
              />
            </View>
          </>
        )}

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Notes</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="Reminder notes..."
            placeholderTextColor={placeholderColor}
            value={formData.notes}
            onChangeText={(text) => setFormData({ ...formData, notes: text })}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">
            Link Contacts (Optional)
          </Text>
          {selectedParticipantIds.length > 0 && (
            <Text className="text-typography-500 text-sm mb-2">
              {selectedParticipantIds.length} contact
              {selectedParticipantIds.length !== 1 ? "s" : ""} selected
            </Text>
          )}
          {isLoadingContacts ? (
            <View className="py-4">
              <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
            </View>
          ) : contacts.length === 0 ? (
            <Text className="text-typography-500 text-sm">
              No contacts available. You can still create this reminder.
            </Text>
          ) : (
            <View className="flex-row flex-wrap">
              {contacts.map((contact) => {
                const isActive = selectedParticipantIds.includes(contact.id);
                return (
                  <Pressable
                    key={contact.id}
                    onPress={() => toggleParticipant(contact.id)}
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
                      {contact.displayName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
