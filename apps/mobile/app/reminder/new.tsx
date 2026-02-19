import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import {
  Contact,
  ReminderRecurrence,
  ReminderStatus,
  contactsApi,
} from "../../lib/api";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { useCreateReminder } from "../../hooks/use-reminders";

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
  const { contactId } = useLocalSearchParams<{ contactId?: string }>();
  const colors = useThemeColors();
  const placeholderColor = getThemeColor(colors, "typography-500");
  const createReminder = useCreateReminder();
  const [contactSearch, setContactSearch] = useState("");
  const [isSearchingContacts, setIsSearchingContacts] = useState(false);
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<Contact[]>([]);

  const [dueDate, setDueDate] = useState(new Date(Date.now() + 60 * 60 * 1000));
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [showDueTimePicker, setShowDueTimePicker] = useState(false);
  const [recurrenceEndsAt, setRecurrenceEndsAt] = useState<Date | null>(null);
  const [showRecEndDatePicker, setShowRecEndDatePicker] = useState(false);
  const [showRecEndTimePicker, setShowRecEndTimePicker] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    notes: "",
    status: "OPEN" as ReminderStatus,
    recurrence: "NONE" as ReminderRecurrence,
    recurrenceInterval: "1",
  });

  useEffect(() => {
    if (!contactId) return;
    contactsApi.get(contactId).then((contact) => {
      setSelectedParticipants((prev) =>
        prev.some((p) => p.id === contact.id) ? prev : [...prev, contact]
      );
    }).catch((err) => console.error("Failed to load contact for pre-selection:", err));
  }, [contactId]);

  useEffect(() => {
    if (contactSearch.trim().length < 2) {
      setContactResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        setIsSearchingContacts(true);
        const data = await contactsApi.list({ search: contactSearch.trim(), limit: 10 });
        setContactResults(data.contacts);
      } catch (error) {
        console.error("Failed to search contacts:", error);
      } finally {
        setIsSearchingContacts(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [contactSearch]);

  const addParticipant = (contact: Contact) => {
    if (!selectedParticipants.some((p) => p.id === contact.id)) {
      setSelectedParticipants((prev) => [...prev, contact]);
    }
    setContactSearch("");
    setContactResults([]);
  };

  const removeParticipant = (contactId: string) => {
    setSelectedParticipants((prev) => prev.filter((p) => p.id !== contactId));
  };

  const onDueDateChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowDueDatePicker(false);
    if (selected) setDueDate(selected);
  };

  const onDueTimeChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowDueTimePicker(false);
    if (selected) setDueDate(selected);
  };

  const onRecEndDateChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowRecEndDatePicker(false);
    if (selected) setRecurrenceEndsAt(selected);
  };

  const onRecEndTimeChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowRecEndTimePicker(false);
    if (selected) setRecurrenceEndsAt(selected);
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      Alert.alert("Error", "Title is required");
      return;
    }

    const recurrenceInterval = Number.parseInt(formData.recurrenceInterval.trim(), 10);
    if (formData.recurrence !== "NONE" && (!Number.isInteger(recurrenceInterval) || recurrenceInterval < 1)) {
      Alert.alert("Error", "Recurrence interval must be a whole number greater than 0");
      return;
    }

    try {
      const created = await createReminder.mutateAsync({
        title: formData.title.trim(),
        notes: formData.notes.trim() || undefined,
        dueAt: dueDate.toISOString(),
        status: formData.status,
        recurrence: formData.recurrence,
        recurrenceInterval: formData.recurrence === "NONE" ? 1 : recurrenceInterval,
        recurrenceEndsAt:
          formData.recurrence === "NONE" ? null : recurrenceEndsAt?.toISOString() || null,
        participantIds: selectedParticipants.length > 0 ? selectedParticipants.map((p) => p.id) : undefined,
      });
      router.replace(`/reminder/${created.id}`);
    } catch (error) {
      console.error("Failed to create reminder:", error);
      Alert.alert("Error", "Failed to create reminder");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-200">
        <Pressable onPress={() => router.back()} className="p-2">
          <Text className="text-primary-600 text-base">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-semibold text-typography-900">New Reminder</Text>
        <Pressable onPress={handleSubmit} disabled={createReminder.isPending} className="p-2">
          <Text
            className={`text-base ${
              createReminder.isPending ? "text-typography-400" : "text-primary-600"
            }`}
          >
            {createReminder.isPending ? "Saving..." : "Save"}
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
          <View className="flex-row">
            <Pressable
              onPress={() => setShowDueDatePicker(true)}
              className="flex-1 mr-2 px-4 py-3 bg-background-50 rounded-lg border border-border-200"
            >
              <Text className="text-typography-900 text-base">
                {format(dueDate, "MMM d, yyyy")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowDueTimePicker(true)}
              className="px-4 py-3 bg-background-50 rounded-lg border border-border-200"
            >
              <Text className="text-typography-900 text-base">
                {format(dueDate, "HH:mm")}
              </Text>
            </Pressable>
          </View>
          {showDueDatePicker && (
            <DateTimePicker
              value={dueDate}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={onDueDateChange}
            />
          )}
          {showDueTimePicker && (
            <DateTimePicker
              value={dueDate}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onDueTimeChange}
            />
          )}
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
              {recurrenceEndsAt ? (
                <View className="flex-row items-center">
                  <Pressable
                    onPress={() => setShowRecEndDatePicker(true)}
                    className="flex-1 mr-2 px-4 py-3 bg-background-50 rounded-lg border border-border-200"
                  >
                    <Text className="text-typography-900 text-base">
                      {format(recurrenceEndsAt, "MMM d, yyyy")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowRecEndTimePicker(true)}
                    className="px-4 py-3 bg-background-50 rounded-lg border border-border-200 mr-2"
                  >
                    <Text className="text-typography-900 text-base">
                      {format(recurrenceEndsAt, "HH:mm")}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setRecurrenceEndsAt(null)} className="p-2">
                    <Text className="text-error-600 text-sm font-medium">Clear</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => {
                    setRecurrenceEndsAt(new Date(dueDate.getTime() + 30 * 24 * 60 * 60 * 1000));
                    setShowRecEndDatePicker(true);
                  }}
                  className="px-4 py-3 bg-background-50 rounded-lg border border-border-200"
                >
                  <Text className="text-typography-500 text-base">Set end date (optional)</Text>
                </Pressable>
              )}
              {showRecEndDatePicker && recurrenceEndsAt && (
                <DateTimePicker
                  value={recurrenceEndsAt}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  onChange={onRecEndDateChange}
                />
              )}
              {showRecEndTimePicker && recurrenceEndsAt && (
                <DateTimePicker
                  value={recurrenceEndsAt}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={onRecEndTimeChange}
                />
              )}
            </View>
          </>
        )}

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Notes</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            style={{ minHeight: 160 }}
            placeholder="Reminder notes..."
            placeholderTextColor={placeholderColor}
            value={formData.notes}
            onChangeText={(text) => setFormData({ ...formData, notes: text })}
            multiline
            numberOfLines={10}
            textAlignVertical="top"
          />
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">
            Link Contacts (Optional)
          </Text>
          {selectedParticipants.length > 0 && (
            <View className="flex-row flex-wrap mb-2">
              {selectedParticipants.map((contact) => (
                <Pressable
                  key={contact.id}
                  onPress={() => removeParticipant(contact.id)}
                  className="flex-row items-center px-3 py-1.5 rounded-full mr-2 mb-2 bg-primary-100 border border-primary-300"
                >
                  <Text className="text-sm font-medium text-primary-700">
                    {contact.displayName}
                  </Text>
                  <Text className="text-primary-700 ml-1.5 text-xs font-bold">✕</Text>
                </Pressable>
              ))}
            </View>
          )}
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="Type a contact name to search..."
            placeholderTextColor={placeholderColor}
            value={contactSearch}
            onChangeText={setContactSearch}
          />
          {isSearchingContacts && (
            <View className="py-2">
              <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
            </View>
          )}
          {contactResults.length > 0 && (
            <View className="mt-2 border border-border-200 rounded-lg bg-background-50">
              {contactResults
                .filter((c) => !selectedParticipants.some((p) => p.id === c.id))
                .map((contact, index, filtered) => (
                  <Pressable
                    key={contact.id}
                    onPress={() => addParticipant(contact)}
                    className={`px-4 py-3 ${index < filtered.length - 1 ? "border-b border-border-200" : ""}`}
                  >
                    <Text className="text-typography-900 text-base">{contact.displayName}</Text>
                  </Pressable>
                ))}
            </View>
          )}
          {contactSearch.trim().length >= 2 && !isSearchingContacts && contactResults.filter((c) => !selectedParticipants.some((p) => p.id === c.id)).length === 0 && (
            <Text className="text-typography-500 text-sm mt-2">No contacts found.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
