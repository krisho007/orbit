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
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import {
  Contact,
  EventType,
  contactsApi,
} from "../../lib/api";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { useCreateEvent } from "../../hooks/use-events";

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: "MEETING", label: "Meeting" },
  { value: "CALL", label: "Call" },
  { value: "BIRTHDAY", label: "Birthday" },
  { value: "ANNIVERSARY", label: "Anniversary" },
  { value: "CONFERENCE", label: "Conference" },
  { value: "SOCIAL", label: "Social" },
  { value: "FAMILY_EVENT", label: "Family Event" },
  { value: "JOURNAL", label: "Journal" },
  { value: "OTHER", label: "Other" },
];

export default function NewEventScreen() {
  const router = useRouter();
  const { contactId, prefill } = useLocalSearchParams<{ contactId?: string; prefill?: string }>();
  const colors = useThemeColors();
  const placeholderColor = getThemeColor(colors, "typography-500");
  const createEvent = useCreateEvent();
  const [contactSearch, setContactSearch] = useState("");
  const [isSearchingContacts, setIsSearchingContacts] = useState(false);
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<Contact[]>([]);

  const [startAt, setStartAt] = useState(new Date(Date.now() + 60 * 60 * 1000));
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [endAt, setEndAt] = useState<Date | null>(null);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    eventType: "OTHER" as EventType,
    location: "",
  });

  useEffect(() => {
    if (!prefill) return;
    try {
      const data = JSON.parse(prefill);
      setFormData((prev) => ({
        ...prev,
        ...(data.title ? { title: data.title } : {}),
        ...(data.eventType ? { eventType: data.eventType } : {}),
        ...(data.location ? { location: data.location } : {}),
        ...(data.description ? { description: data.description } : {}),
      }));
      if (data.startAt) {
        const d = new Date(data.startAt);
        if (!Number.isNaN(d.getTime())) setStartAt(d);
      }
      if (data.endAt) {
        const d = new Date(data.endAt);
        if (!Number.isNaN(d.getTime())) setEndAt(d);
      }
      if (data.participantNames && Array.isArray(data.participantNames)) {
        for (const name of data.participantNames) {
          contactsApi.list({ search: String(name), limit: 1 }).then((res) => {
            if (res.contacts.length > 0) {
              setSelectedParticipants((prev) =>
                prev.some((p) => p.id === res.contacts[0].id) ? prev : [...prev, res.contacts[0]]
              );
            }
          }).catch(() => {});
        }
      }
    } catch {}
  }, []);

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

  const onStartDateChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowStartDatePicker(false);
    if (selected) setStartAt(selected);
  };

  const onStartTimeChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowStartTimePicker(false);
    if (selected) setStartAt(selected);
  };

  const onEndDateChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowEndDatePicker(false);
    if (selected) setEndAt(selected);
  };

  const onEndTimeChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowEndTimePicker(false);
    if (selected) setEndAt(selected);
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      Alert.alert("Error", "Title is required");
      return;
    }

    try {
      const created = await createEvent.mutateAsync({
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        eventType: formData.eventType,
        startAt: startAt.toISOString(),
        endAt: endAt?.toISOString() || undefined,
        location: formData.location.trim() || undefined,
        participantIds: selectedParticipants.length > 0 ? selectedParticipants.map((p) => p.id) : undefined,
      });
      router.replace(`/event/${created.id}`);
    } catch (error) {
      console.error("Failed to create event:", error);
      Alert.alert("Error", "Failed to create event");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-200">
        <Pressable onPress={() => router.back()} className="p-2">
          <Text className="text-primary-600 text-base">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-body-semibold text-typography-900">New Event</Text>
        <Pressable onPress={handleSubmit} disabled={createEvent.isPending} className="p-2">
          <Text
            className={`text-base ${
              createEvent.isPending ? "text-typography-400" : "text-primary-600"
            }`}
          >
            {createEvent.isPending ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
      <ScrollView className="flex-1 px-4 py-6" keyboardShouldPersistTaps="handled">
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">Title *</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="Event title"
            placeholderTextColor={placeholderColor}
            value={formData.title}
            onChangeText={(text) => setFormData({ ...formData, title: text })}
          />
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">Type</Text>
          <View className="flex-row flex-wrap">
            {EVENT_TYPE_OPTIONS.map((option) => {
              const isActive = formData.eventType === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setFormData({ ...formData, eventType: option.value })}
                  className={`px-3 py-1.5 rounded-full mr-2 mb-2 border ${
                    isActive
                      ? "bg-primary-100 border-primary-300"
                      : "bg-background-50 border-border-200"
                  }`}
                >
                  <Text
                    className={`text-sm font-body-medium ${
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

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">Start *</Text>
          <View className="flex-row">
            <Pressable
              onPress={() => setShowStartDatePicker(true)}
              className="flex-1 mr-2 px-4 py-3 bg-background-50 rounded-lg border border-border-200"
            >
              <Text className="text-typography-900 text-base">
                {format(startAt, "MMM d, yyyy")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowStartTimePicker(true)}
              className="px-4 py-3 bg-background-50 rounded-lg border border-border-200"
            >
              <Text className="text-typography-900 text-base">
                {format(startAt, "HH:mm")}
              </Text>
            </Pressable>
          </View>
          {showStartDatePicker && (
            <DateTimePicker
              value={startAt}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={onStartDateChange}
            />
          )}
          {showStartTimePicker && (
            <DateTimePicker
              value={startAt}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onStartTimeChange}
            />
          )}
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">End</Text>
          {endAt ? (
            <View className="flex-row items-center">
              <Pressable
                onPress={() => setShowEndDatePicker(true)}
                className="flex-1 mr-2 px-4 py-3 bg-background-50 rounded-lg border border-border-200"
              >
                <Text className="text-typography-900 text-base">
                  {format(endAt, "MMM d, yyyy")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowEndTimePicker(true)}
                className="px-4 py-3 bg-background-50 rounded-lg border border-border-200 mr-2"
              >
                <Text className="text-typography-900 text-base">
                  {format(endAt, "HH:mm")}
                </Text>
              </Pressable>
              <Pressable onPress={() => setEndAt(null)} className="p-2">
                <Text className="text-error-600 text-sm font-body-medium">Clear</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                setEndAt(new Date(startAt.getTime() + 60 * 60 * 1000));
                setShowEndDatePicker(true);
              }}
              className="px-4 py-3 bg-background-50 rounded-lg border border-border-200"
            >
              <Text className="text-typography-500 text-base">Set end time (optional)</Text>
            </Pressable>
          )}
          {showEndDatePicker && endAt && (
            <DateTimePicker
              value={endAt}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={onEndDateChange}
            />
          )}
          {showEndTimePicker && endAt && (
            <DateTimePicker
              value={endAt}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onEndTimeChange}
            />
          )}
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">Location</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="Event location"
            placeholderTextColor={placeholderColor}
            value={formData.location}
            onChangeText={(text) => setFormData({ ...formData, location: text })}
          />
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">Notes</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            style={{ minHeight: 120 }}
            placeholder="Event notes..."
            placeholderTextColor={placeholderColor}
            value={formData.description}
            onChangeText={(text) => setFormData({ ...formData, description: text })}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">
            Participants (Optional)
          </Text>
          {selectedParticipants.length > 0 && (
            <View className="flex-row flex-wrap mb-2">
              {selectedParticipants.map((contact) => (
                <Pressable
                  key={contact.id}
                  onPress={() => removeParticipant(contact.id)}
                  className="flex-row items-center px-3 py-1.5 rounded-full mr-2 mb-2 bg-primary-100 border border-primary-300"
                >
                  <Text className="text-sm font-body-medium text-primary-700">
                    {contact.displayName}
                  </Text>
                  <Text className="text-primary-700 ml-1.5 text-xs font-body-bold">✕</Text>
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
