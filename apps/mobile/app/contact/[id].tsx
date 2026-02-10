import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
  Alert,
  Image,
  BackHandler,
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
  Bell,
  CheckCircle2,
  XCircle,
} from "lucide-react-native";
import Svg, { Path } from "react-native-svg";
import { contactsApi, conversationsApi, remindersApi, Contact, Conversation, Reminder, ReminderStatus } from "../../lib/api";
import { getThemeColor, useThemeColors } from "../../lib/theme";

function WhatsAppIcon({ size = 20, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </Svg>
  );
}

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

const REMINDER_STATUS_META: Record<
  ReminderStatus,
  { label: string; icon: typeof Bell }
> = {
  OPEN: { label: "Open", icon: Bell },
  DONE: { label: "Done", icon: CheckCircle2 },
  CANCELED: { label: "Canceled", icon: XCircle },
};

export default function ContactDetailScreen() {
  const router = useRouter();
  const { id, from } = useLocalSearchParams<{
    id: string;
    from?: string | string[];
  }>();
  const colors = useThemeColors();
  const backHref = Array.isArray(from) ? from[0] : from;
  const [contact, setContact] = useState<Contact | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [nextConversationCursor, setNextConversationCursor] = useState<string | null>(
    null
  );
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoadingReminders, setIsLoadingReminders] = useState(true);
  const [nextReminderCursor, setNextReminderCursor] = useState<string | null>(null);
  const [isLoadingMoreReminders, setIsLoadingMoreReminders] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleBack = useCallback(() => {
    if (backHref) {
      router.replace(backHref as any);
      return;
    }
    router.back();
  }, [backHref, router]);

  useEffect(() => {
    loadContact();
  }, [id]);

  useEffect(() => {
    loadConversations();
  }, [id]);

  useEffect(() => {
    loadReminders();
  }, [id]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleBack]);

  const loadContact = async () => {
    try {
      setIsLoading(true);
      const data = await contactsApi.get(id);
      setContact(data);
    } catch (error) {
      console.error("Failed to load contact:", error);
      Alert.alert("Error", "Failed to load contact details");
      handleBack();
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

  const loadReminders = async () => {
    try {
      setIsLoadingReminders(true);
      const data = await remindersApi.list({
        contactId: id,
        limit: 10,
      });
      setReminders(data.reminders);
      setNextReminderCursor(data.nextCursor);
    } catch (error) {
      console.error("Failed to load contact reminders:", error);
      setReminders([]);
      setNextReminderCursor(null);
    } finally {
      setIsLoadingReminders(false);
    }
  };

  const loadMoreReminders = async () => {
    if (!nextReminderCursor || isLoadingMoreReminders) {
      return;
    }

    try {
      setIsLoadingMoreReminders(true);
      const data = await remindersApi.list({
        contactId: id,
        cursor: nextReminderCursor,
        limit: 10,
      });
      setReminders((prev) => [...prev, ...data.reminders]);
      setNextReminderCursor(data.nextCursor);
    } catch (error) {
      console.error("Failed to load more contact reminders:", error);
      setNextReminderCursor(null);
    } finally {
      setIsLoadingMoreReminders(false);
    }
  };

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsApp = (phone: string) => {
    const cleaned = phone.replace(/[^0-9+]/g, "").replace(/^\+/, "");
    Linking.openURL(`https://wa.me/${cleaned}`).catch(() => {
      Alert.alert("WhatsApp not available", "Could not open WhatsApp for this number.");
    });
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
              handleBack();
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
        <Pressable onPress={handleBack} className="p-2">
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
              <View className="flex-row items-center justify-between py-3 px-4 bg-background-50 rounded-lg">
                <Text className="text-typography-900 text-base">
                  {contact.primaryPhone}
                </Text>
                <View className="flex-row items-center gap-4">
                  <Pressable
                    onPress={() => handleWhatsApp(contact.primaryPhone!)}
                    hitSlop={8}
                    className="active:opacity-50"
                  >
                    <WhatsAppIcon size={22} color="#25D366" />
                  </Pressable>
                  <Pressable
                    onPress={() => handleCall(contact.primaryPhone!)}
                    hitSlop={8}
                    className="active:opacity-50"
                  >
                    <Phone size={20} color={getThemeColor(colors, "success-500")} />
                  </Pressable>
                </View>
              </View>
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

        {/* Reminders */}
        <View className="px-4 py-4 border-t border-border-200">
          <View className="mb-3">
            <Text className="text-typography-900 text-base font-semibold">Reminders</Text>
          </View>

          {isLoadingReminders ? (
            <View className="py-8 items-center">
              <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
            </View>
          ) : reminders.length === 0 ? (
            <View className="py-6 px-4 bg-background-50 rounded-xl">
              <Text className="text-typography-600 text-sm">
                No reminders for this contact yet.
              </Text>
            </View>
          ) : (
            <>
              {reminders.map((reminder) => {
                const statusMeta = REMINDER_STATUS_META[reminder.status] || REMINDER_STATUS_META.OPEN;
                const StatusIcon = statusMeta.icon;
                const dueDate = new Date(reminder.dueAt);
                const dueLabel = Number.isNaN(dueDate.getTime())
                  ? "Due date unknown"
                  : format(dueDate, "MMM d, yyyy");
                const iconColor =
                  reminder.status === "DONE"
                    ? getThemeColor(colors, "success-600")
                    : reminder.status === "CANCELED"
                      ? getThemeColor(colors, "error-500")
                      : getThemeColor(colors, "primary-600");

                return (
                  <Pressable
                    key={reminder.id}
                    onPress={() =>
                      router.push({
                        pathname: "/reminder/[id]",
                        params: { id: reminder.id, from: `/contact/${id}` },
                      })
                    }
                    className="mb-3 p-4 rounded-xl border border-border-200 bg-background-50 active:bg-background-100"
                  >
                    <View className="flex-row items-start">
                      <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mr-3">
                        <StatusIcon size={18} color={iconColor} />
                      </View>

                      <View className="flex-1">
                        <View className="flex-row items-center justify-between mb-1">
                          <Text className="text-typography-900 text-sm font-semibold flex-1" numberOfLines={1}>
                            {reminder.title}
                          </Text>
                          <Text className="text-typography-400 text-xs ml-2">
                            {dueLabel}
                          </Text>
                        </View>

                        {reminder.notes ? (
                          <Text
                            className="text-typography-700 text-sm"
                            numberOfLines={2}
                          >
                            {reminder.notes}
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

              {nextReminderCursor && (
                <Pressable
                  onPress={loadMoreReminders}
                  disabled={isLoadingMoreReminders}
                  className="mt-1 py-3 rounded-lg bg-background-100 active:bg-background-200"
                >
                  {isLoadingMoreReminders ? (
                    <ActivityIndicator
                      size="small"
                      color={getThemeColor(colors, "primary-600")}
                    />
                  ) : (
                    <Text className="text-primary-600 text-center text-sm font-medium">
                      Load more reminders
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
