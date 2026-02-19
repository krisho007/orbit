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
  ConversationMedium,
  contactsApi,
} from "../../lib/api";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { useCreateConversation } from "../../hooks/use-conversations";

const MEDIUM_OPTIONS: { value: ConversationMedium; label: string }[] = [
  { value: "PHONE_CALL", label: "Phone Call" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "CHANCE_ENCOUNTER", label: "Chance Encounter" },
  { value: "ONLINE_MEETING", label: "Online Meeting" },
  { value: "IN_PERSON_MEETING", label: "In-Person Meeting" },
  { value: "OTHER", label: "Other" },
];

export default function NewConversationScreen() {
  const router = useRouter();
  const { contactId } = useLocalSearchParams<{ contactId?: string }>();
  const colors = useThemeColors();
  const placeholderColor = getThemeColor(colors, "typography-500");
  const createConversation = useCreateConversation();
  const [contactSearch, setContactSearch] = useState("");
  const [isSearchingContacts, setIsSearchingContacts] = useState(false);
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<Contact[]>([]);

  const [happenedAt, setHappenedAt] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [followUpAt, setFollowUpAt] = useState<Date | null>(null);
  const [showFollowUpDatePicker, setShowFollowUpDatePicker] = useState(false);
  const [showFollowUpTimePicker, setShowFollowUpTimePicker] = useState(false);

  const [formData, setFormData] = useState({
    content: "",
    medium: "OTHER" as ConversationMedium,
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

  const removeParticipant = (id: string) => {
    setSelectedParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const onDateChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (selected) setHappenedAt(selected);
  };

  const onTimeChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowTimePicker(false);
    if (selected) setHappenedAt(selected);
  };

  const onFollowUpDateChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowFollowUpDatePicker(false);
    if (selected) setFollowUpAt(selected);
  };

  const onFollowUpTimeChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowFollowUpTimePicker(false);
    if (selected) setFollowUpAt(selected);
  };

  const handleSubmit = async () => {
    try {
      const created = await createConversation.mutateAsync({
        content: formData.content.trim() || undefined,
        medium: formData.medium,
        happenedAt: happenedAt.toISOString(),
        followUpAt: followUpAt?.toISOString() || undefined,
        participantIds: selectedParticipants.map((p) => p.id),
      });
      router.replace(`/conversation/${created.id}`);
    } catch (error) {
      console.error("Failed to create conversation:", error);
      Alert.alert("Error", "Failed to create conversation");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-200">
        <Pressable onPress={() => router.back()} className="p-2">
          <Text className="text-primary-600 text-base">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-semibold text-typography-900">New Conversation</Text>
        <Pressable onPress={handleSubmit} disabled={createConversation.isPending} className="p-2">
          <Text
            className={`text-base ${
              createConversation.isPending ? "text-typography-400" : "text-primary-600"
            }`}
          >
            {createConversation.isPending ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4 py-6">
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Medium *</Text>
          <View className="flex-row flex-wrap">
            {MEDIUM_OPTIONS.map((option) => {
              const isActive = formData.medium === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setFormData({ ...formData, medium: option.value })}
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
          <Text className="text-typography-700 text-sm font-medium mb-2">Date *</Text>
          <View className="flex-row">
            <Pressable
              onPress={() => setShowDatePicker(true)}
              className="flex-1 mr-2 px-4 py-3 bg-background-50 rounded-lg border border-border-200"
            >
              <Text className="text-typography-900 text-base">
                {format(happenedAt, "MMM d, yyyy")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowTimePicker(true)}
              className="px-4 py-3 bg-background-50 rounded-lg border border-border-200"
            >
              <Text className="text-typography-900 text-base">
                {format(happenedAt, "HH:mm")}
              </Text>
            </Pressable>
          </View>
          {showDatePicker && (
            <DateTimePicker
              value={happenedAt}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={onDateChange}
            />
          )}
          {showTimePicker && (
            <DateTimePicker
              value={happenedAt}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onTimeChange}
            />
          )}
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Follow-up Date</Text>
          {followUpAt ? (
            <View className="flex-row items-center">
              <Pressable
                onPress={() => setShowFollowUpDatePicker(true)}
                className="flex-1 mr-2 px-4 py-3 bg-background-50 rounded-lg border border-border-200"
              >
                <Text className="text-typography-900 text-base">
                  {format(followUpAt, "MMM d, yyyy")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowFollowUpTimePicker(true)}
                className="px-4 py-3 bg-background-50 rounded-lg border border-border-200 mr-2"
              >
                <Text className="text-typography-900 text-base">
                  {format(followUpAt, "HH:mm")}
                </Text>
              </Pressable>
              <Pressable onPress={() => setFollowUpAt(null)} className="p-2">
                <Text className="text-error-600 text-sm font-medium">Clear</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                setFollowUpAt(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
                setShowFollowUpDatePicker(true);
              }}
              className="px-4 py-3 bg-background-50 rounded-lg border border-border-200"
            >
              <Text className="text-typography-500 text-base">Set follow-up date (optional)</Text>
            </Pressable>
          )}
          {showFollowUpDatePicker && followUpAt && (
            <DateTimePicker
              value={followUpAt}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={onFollowUpDateChange}
            />
          )}
          {showFollowUpTimePicker && followUpAt && (
            <DateTimePicker
              value={followUpAt}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onFollowUpTimeChange}
            />
          )}
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Notes</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            style={{ minHeight: 160 }}
            placeholder="Conversation notes..."
            placeholderTextColor={placeholderColor}
            value={formData.content}
            onChangeText={(text) => setFormData({ ...formData, content: text })}
            multiline
            numberOfLines={10}
            textAlignVertical="top"
          />
        </View>

        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">
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
