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
import { eventsApi, Event, EventType } from "../../../lib/api";
import { getThemeColor, useThemeColors } from "../../../lib/theme";
import { useUpdateEvent } from "../../../hooks/use-events";
import { DateField, TimeField } from "../../../components/date-time-field";

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

export default function EditEventScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const placeholderColor = getThemeColor(colors, "typography-500");
  const updateEvent = useUpdateEvent();
  const [isLoading, setIsLoading] = useState(true);
  const [event, setEvent] = useState<Event | null>(null);

  const [startAt, setStartAt] = useState(new Date());
  const [endAt, setEndAt] = useState<Date | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    eventType: "OTHER" as EventType,
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
        location: data.location || "",
      });
      if (data.startAt) {
        const d = new Date(data.startAt);
        if (!isNaN(d.getTime())) setStartAt(d);
      }
      if (data.endAt) {
        const d = new Date(data.endAt);
        if (!isNaN(d.getTime())) setEndAt(d);
      }
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

    try {
      await updateEvent.mutateAsync({
        id,
        data: {
          title: formData.title.trim(),
          description: formData.description.trim(),
          eventType: formData.eventType,
          startAt: startAt.toISOString(),
          endAt: endAt?.toISOString() || undefined,
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
        <Text className="text-lg font-body-semibold text-typography-900">Edit Event</Text>
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
            <DateField value={startAt} onChange={setStartAt} grow />
            <TimeField value={startAt} onChange={setStartAt} />
          </View>
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">End</Text>
          {endAt ? (
            <View className="flex-row items-center">
              <DateField value={endAt} onChange={setEndAt} grow />
              <View className="mx-2" />
              <TimeField value={endAt} onChange={setEndAt} />
              <Pressable onPress={() => setEndAt(null)} className="p-2 ml-2">
                <Text className="text-error-600 text-sm font-body-medium">Clear</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setEndAt(new Date(startAt.getTime() + 60 * 60 * 1000))}
              className="px-4 py-3 bg-background-50 rounded-lg border border-border-200"
            >
              <Text className="text-typography-500 text-base">Set end time (optional)</Text>
            </Pressable>
          )}
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">Location</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="Location"
            placeholderTextColor={placeholderColor}
            value={formData.location}
            onChangeText={(text) => setFormData({ ...formData, location: text })}
          />
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">Notes</Text>
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
            <Text className="text-typography-700 text-sm font-body-medium mb-2">Participants</Text>
            <Text className="text-typography-500 text-sm">
              {event.participants.map((p) => p.contact.displayName).join(", ")}
            </Text>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
