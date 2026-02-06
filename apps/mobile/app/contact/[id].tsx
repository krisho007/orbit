import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
  Alert,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import {
  Phone,
  MessageCircle,
  Mail,
  Handshake,
  Monitor,
  Building2,
  FileText,
  ChevronLeft,
  Pencil,
  Trash2,
} from "lucide-react-native";
import { contactsApi, conversationsApi, Contact, Conversation } from "../../lib/api";
import { getThemeColor, useThemeColors } from "../../lib/theme";

const MEDIUM_META: Record<
  string,
  { label: string; icon: typeof Phone }
> = {
  PHONE_CALL: { label: "Phone Call", icon: Phone },
  WHATSAPP: { label: "WhatsApp", icon: MessageCircle },
  EMAIL: { label: "Email", icon: Mail },
  CHANCE_ENCOUNTER: { label: "Chance Encounter", icon: Handshake },
  ONLINE_MEETING: { label: "Online Meeting", icon: Monitor },
  IN_PERSON_MEETING: { label: "In-Person Meeting", icon: Building2 },
  OTHER: { label: "Other", icon: FileText },
};

export default function ContactDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const [contact, setContact] = useState<Contact | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [nextConversationCursor, setNextConversationCursor] = useState<string | null>(
    null
  );
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadContact();
  }, [id]);

  useEffect(() => {
    loadConversations();
  }, [id]);

  const loadContact = async () => {
    try {
      setIsLoading(true);
      const data = await contactsApi.get(id);
      setContact(data);
    } catch (error) {
      console.error("Failed to load contact:", error);
      Alert.alert("Error", "Failed to load contact details");
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const loadConversations = async () => {
    try {
      setIsLoadingConversations(true);
      const data = await conversationsApi.listByContacts({
        contactIds: [id],
        limit: 10,
      });
      setConversations(data.conversations);
      setNextConversationCursor(data.nextCursor);
    } catch (error) {
      console.error("Failed to load contact conversations:", error);
      setConversations([]);
      setNextConversationCursor(null);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const loadMoreConversations = async () => {
    if (!nextConversationCursor || isLoadingMoreConversations) {
      return;
    }

    try {
      setIsLoadingMoreConversations(true);
      const data = await conversationsApi.listByContacts({
        contactIds: [id],
        cursor: nextConversationCursor,
        limit: 10,
      });
      setConversations((prev) => [...prev, ...data.conversations]);
      setNextConversationCursor(data.nextCursor);
    } catch (error) {
      console.error("Failed to load more contact conversations:", error);
      setNextConversationCursor(null);
    } finally {
      setIsLoadingMoreConversations(false);
    }
  };

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleEmail = (email: string) => {
    Linking.openURL(`mailto:${email}`);
  };

  const handleDelete = async () => {
    Alert.alert(
      "Delete Contact",
      "Are you sure you want to delete this contact?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await contactsApi.delete(id);
              router.back();
            } catch (error) {
              console.error("Failed to delete contact:", error);
              Alert.alert("Error", "Failed to delete contact");
            }
          },
        },
      ]
    );
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

  if (!contact) {
    return (
      <SafeAreaView className="flex-1 bg-background-0">
        <View className="flex-1 items-center justify-center">
          <Text className="text-typography-500">Contact not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-200">
        <Pressable onPress={() => router.back()} className="p-2">
          <ChevronLeft size={22} color={getThemeColor(colors, "primary-600")} />
        </Pressable>
        <Text className="text-lg font-semibold text-typography-900">Contact</Text>
        <View className="flex-row items-center">
          <Pressable onPress={handleDelete} className="p-2 mr-1">
            <Trash2 size={20} color={getThemeColor(colors, "error-500")} />
          </Pressable>
          <Pressable onPress={() => router.push(`/contact/${id}/edit`)} className="p-2">
            <Pencil size={20} color={getThemeColor(colors, "primary-600")} />
          </Pressable>
        </View>
      </View>

      <ScrollView className="flex-1">
        {/* Avatar & Name */}
        <View className="items-center py-8 bg-background-50">
          {contact.images?.[0]?.imageUrl ? (
            <Image
              source={{ uri: contact.images[0].imageUrl }}
              className="w-24 h-24 rounded-full mb-4"
            />
          ) : (
            <View className="w-24 h-24 rounded-full bg-primary-100 items-center justify-center mb-4">
              <Text className="text-primary-700 text-4xl font-semibold">
                {contact.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text className="text-2xl font-bold text-typography-900 mb-1">
            {contact.displayName}
          </Text>
          {(contact.company || contact.jobTitle) && (
            <Text className="text-typography-500 text-base">
              {[contact.jobTitle, contact.company].filter(Boolean).join(" at ")}
            </Text>
          )}
        </View>

        {/* Tags */}
        {contact.tags && contact.tags.length > 0 && (
          <View className="px-4 py-4 border-b border-border-200">
            <Text className="text-typography-500 text-sm font-medium mb-2">Tags</Text>
            <View className="flex-row flex-wrap">
              {contact.tags.map((tag) => (
                <View
                  key={tag.id}
                  className="px-3 py-1.5 rounded-full mr-2 mb-2"
                  style={{ backgroundColor: tag.color + "20" }}
                >
                  <Text
                    style={{ color: tag.color }}
                    className="text-sm font-medium"
                  >
                    {tag.name}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Contact Info */}
        <View className="px-4 py-4">
          {/* Phone Numbers */}
          {contact.primaryPhone && (
            <View className="mb-4">
              <Text className="text-typography-500 text-sm font-medium mb-2">
                Phone
              </Text>
              <Pressable
                onPress={() => handleCall(contact.primaryPhone!)}
                className="flex-row items-center justify-between py-3 px-4 bg-background-50 rounded-lg active:bg-background-100"
              >
                <Text className="text-typography-900 text-base">
                  {contact.primaryPhone}
                </Text>
                <Phone size={20} color={getThemeColor(colors, "success-500")} />
              </Pressable>
            </View>
          )}

          {/* Email */}
          {contact.primaryEmail && (
            <View className="mb-4">
              <Text className="text-typography-500 text-sm font-medium mb-2">
                Email
              </Text>
              <Pressable
                onPress={() => handleEmail(contact.primaryEmail!)}
                className="flex-row items-center justify-between py-3 px-4 bg-background-50 rounded-lg active:bg-background-100"
              >
                <Text className="text-typography-900 text-base">
                  {contact.primaryEmail}
                </Text>
                <Text className="text-primary-600 text-base">Email</Text>
              </Pressable>
            </View>
          )}

          {/* Birthday */}
          {contact.dateOfBirth && (
            <View className="mb-4">
              <Text className="text-typography-500 text-sm font-medium mb-2">
                Birthday
              </Text>
              <View className="py-3 px-4 bg-background-50 rounded-lg">
                <Text className="text-typography-900 text-base">
                  {new Date(contact.dateOfBirth).toLocaleDateString()}
                </Text>
              </View>
            </View>
          )}

          {/* Notes */}
          {contact.notes && (
            <View className="mb-4">
              <Text className="text-typography-500 text-sm font-medium mb-2">
                Notes
              </Text>
              <View className="py-3 px-4 bg-background-50 rounded-lg">
                <Text className="text-typography-900 text-base">{contact.notes}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Conversations */}
        <View className="px-4 py-4 border-t border-border-200">
          <View className="mb-3">
            <Text className="text-typography-900 text-base font-semibold">Conversations</Text>
          </View>

          {isLoadingConversations ? (
            <View className="py-8 items-center">
              <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
            </View>
          ) : conversations.length === 0 ? (
            <View className="py-6 px-4 bg-background-50 rounded-xl">
              <Text className="text-typography-600 text-sm">
                No conversations with this contact yet.
              </Text>
            </View>
          ) : (
            <>
              {conversations.map((conversation) => {
                const medium = MEDIUM_META[conversation.medium] || MEDIUM_META.OTHER;
                const MediumIcon = medium.icon;

                return (
                  <Pressable
                    key={conversation.id}
                    onPress={() => router.push(`/conversation/${conversation.id}`)}
                    className="mb-3 p-4 rounded-xl border border-border-200 bg-background-50 active:bg-background-100"
                  >
                    <View className="flex-row items-start">
                      <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mr-3">
                        <MediumIcon size={18} color={getThemeColor(colors, "primary-600")} />
                      </View>

                      <View className="flex-1">
                        <View className="flex-row items-center justify-between mb-1">
                          <Text className="text-typography-900 text-sm font-semibold">
                            {medium.label}
                          </Text>
                          <Text className="text-typography-400 text-xs ml-2">
                            {format(new Date(conversation.happenedAt), "MMM d, yyyy")}
                          </Text>
                        </View>

                        {conversation.content ? (
                          <Text
                            className="text-typography-700 text-sm"
                            numberOfLines={2}
                          >
                            {conversation.content}
                          </Text>
                        ) : (
                          <Text className="text-typography-400 text-sm italic">
                            No notes
                          </Text>
                        )}
                      </View>
                    </View>
                  </Pressable>
                );
              })}

              {nextConversationCursor && (
                <Pressable
                  onPress={loadMoreConversations}
                  disabled={isLoadingMoreConversations}
                  className="mt-1 py-3 rounded-lg bg-background-100 active:bg-background-200"
                >
                  {isLoadingMoreConversations ? (
                    <ActivityIndicator
                      size="small"
                      color={getThemeColor(colors, "primary-600")}
                    />
                  ) : (
                    <Text className="text-primary-600 text-center text-sm font-medium">
                      Load more conversations
                    </Text>
                  )}
                </Pressable>
              )}
            </>
          )}
        </View>

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
