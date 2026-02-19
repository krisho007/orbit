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
import { useRouter, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import { eventsApi, Event, EventType } from "../../../lib/api";
import { getThemeColor, useThemeColors } from "../../../lib/theme";
import { useUpdateEvent } from "../../../hooks/use-events";

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: "MEETING", label: "Meeting" },
  { value: "CALL", label: "Call" },
  { value: "BIRTHDAY", label: "Birthday" },
  { value: "ANNIVERSARY", label: "Anniversary" },
  { value: "CONFERENCE", label: "Conference" },
  { value: "SOCIAL", label: "Social" },
  { value: "FAMILY_EVENT", label: "Family Event" },
  { value: "OTHER", label: "Other" },
];

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

export default function EditEventScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const placeholderColor = getThemeColor(colors, "typography-500");
  const updateEvent = useUpdateEvent();
  const [isLoading, setIsLoading] = useState(true);
  const [event, setEvent] = useState<Event | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    eventType: "OTHER" as EventType,
    startAt: "",
    endAt: "",
    location: "",
  });

  useEffect(() => {
    loadEvent();
  }, [id]);

  const loadEvent = async () => {
    try {
      setIsLoading(true);
      const data = await eventsApi.get(id);
      setEvent(data);
      setFormData({
        title: data.title || "",
        description: data.description || "",
        eventType: data.eventType,
        startAt: formatDateInput(data.startAt),
        endAt: formatDateInput(data.endAt),
        location: data.location || "",
      });
    } catch (error) {
      console.error("Failed to load event:", error);
      Alert.alert("Error", "Failed to load event");
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      Alert.alert("Error", "Title is required");
      return;
    }

    const startAt = parseDateInput(formData.startAt);
    if (!startAt) {
      Alert.alert("Error", "Enter a valid start date/time");
      return;
    }

    const endAtParsed = formData.endAt.trim() ? parseDateInput(formData.endAt) : undefined;
    if (formData.endAt.trim() && !endAtParsed) {
      Alert.alert("Error", "Enter a valid end date/time");
      return;
    }

    try {
      await updateEvent.mutateAsync({
        id,
        data: {
          title: formData.title.trim(),
          description: formData.description.trim(),
          eventType: formData.eventType,
          startAt,
          endAt: endAtParsed || undefined,
          location: formData.location.trim() || undefined,
        },
      });
      router.back();
    } catch (error) {
      console.error("Failed to update event:", error);
      Alert.alert("Error", "Failed to update event");
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

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-200">
        <Pressable onPress={() => router.back()} className="p-2">
          <Text className="text-primary-600 text-base">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-semibold text-typography-900">Edit Event</Text>
        <Pressable onPress={handleSubmit} disabled={updateEvent.isPending} className="p-2">
          <Text
            className={`text-base ${
              updateEvent.isPending ? "text-typography-400" : "text-primary-600"
            }`}
          >
            {updateEvent.isPending ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4 py-6">
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Title *</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="Event title"
            placeholderTextColor={placeholderColor}
            value={formData.title}
            onChangeText={(text) => setFormData({ ...formData, title: text })}
          />
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Type</Text>
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

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Start At *</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="YYYY-MM-DD HH:mm"
            placeholderTextColor={placeholderColor}
            value={formData.startAt}
            onChangeText={(text) => setFormData({ ...formData, startAt: text })}
          />
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">End At</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="YYYY-MM-DD HH:mm"
            placeholderTextColor={placeholderColor}
            value={formData.endAt}
            onChangeText={(text) => setFormData({ ...formData, endAt: text })}
          />
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Location</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="Location"
            placeholderTextColor={placeholderColor}
            value={formData.location}
            onChangeText={(text) => setFormData({ ...formData, location: text })}
          />
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Notes</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="Event notes..."
            placeholderTextColor={placeholderColor}
            value={formData.description}
            onChangeText={(text) => setFormData({ ...formData, description: text })}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
        </View>

        {event?.participants && event.participants.length > 0 && (
          <View className="mb-4">
            <Text className="text-typography-700 text-sm font-medium mb-2">Participants</Text>
            <Text className="text-typography-500 text-sm">
              {event.participants.map((p) => p.contact.displayName).join(", ")}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
