import React, { useCallback, useEffect, useState } from "react";
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
  useWindowDimensions,
} from "react-native";
import { RelationshipGraph } from "../../components/relationship-graph";
import { RelationshipGraphFullscreen } from "../../components/relationship-graph-fullscreen";
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
  Plus,
  Maximize2,
  GitFork,
  Cake,
  StickyNote,
  MapPin,
} from "lucide-react-native";
import Svg, { Path } from "react-native-svg";
import { Conversation, Reminder, Relationship, ReminderStatus } from "../../lib/api";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { useContact, useDeleteContact } from "../../hooks/use-contacts";
import { useConversationsByContact } from "../../hooks/use-conversations";
import { useReminders } from "../../hooks/use-reminders";
import { useRelationshipsByContact } from "../../hooks/use-relationships";

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
  const [showFullscreenGraph, setShowFullscreenGraph] = useState(false);
  const { width: windowWidth } = useWindowDimensions();

  const { data: contact, isLoading } = useContact(id);
  const deleteContact = useDeleteContact();

  const conversationsQuery = useConversationsByContact(id);
  const conversations = conversationsQuery.data?.pages.flatMap((p) => p.conversations) ?? [];
  const isLoadingConversations = conversationsQuery.isLoading;
  const hasMoreConversations = conversationsQuery.hasNextPage;
  const isLoadingMoreConversations = conversationsQuery.isFetchingNextPage;

  const remindersQuery = useReminders({ contactId: id });
  const reminders = remindersQuery.data?.pages.flatMap((p) => p.reminders) ?? [];
  const isLoadingReminders = remindersQuery.isLoading;
  const hasMoreReminders = remindersQuery.hasNextPage;
  const isLoadingMoreReminders = remindersQuery.isFetchingNextPage;

  const { data: relationships = [], isLoading: isLoadingRelationships } =
    useRelationshipsByContact(id);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace((backHref || "/(tabs)/index") as any);
  }, [backHref, router]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleBack]);

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
              await deleteContact.mutateAsync(id);
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
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={handleBack} className="p-2">
          <ChevronLeft size={22} color={getThemeColor(colors, "primary-600")} />
        </Pressable>
        <Text className="text-lg font-body-semibold text-typography-900">Contact</Text>
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
        {/* Hero — Avatar, Name, Tags, Quick Actions */}
        <View className="items-center py-8">
          {contact.images?.[0]?.imageUrl ? (
            <Image
              source={{ uri: contact.images[0].imageUrl }}
              className="w-24 h-24 rounded-full mb-4"
            />
          ) : (
            <View className="w-24 h-24 rounded-full bg-primary-100 items-center justify-center mb-4">
              <Text className="text-primary-700 text-4xl font-body-semibold">
                {contact.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text className="text-2xl font-heading-bold text-typography-900 mb-1">
            {contact.displayName}
          </Text>
          {(contact.company || contact.jobTitle) && (
            <Text className="text-typography-500 text-base text-center px-4 mb-2">
              {[contact.jobTitle, contact.company].filter(Boolean).join(" at ")}
            </Text>
          )}

          {/* Tags inline */}
          {contact.tags && contact.tags.length > 0 && (
            <View className="flex-row flex-wrap justify-center mt-2 px-4">
              {contact.tags.map((tag) => (
                <View
                  key={tag.id}
                  className="px-3 py-1.5 rounded-full mr-2 mb-2"
                  style={{ backgroundColor: tag.color + "20" }}
                >
                  <Text
                    style={{ color: tag.color }}
                    className="text-sm font-body-medium"
                  >
                    {tag.name}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Quick action buttons */}
          {(contact.primaryPhone || contact.primaryEmail) && (
            <View className="flex-row items-center justify-center mt-4 gap-6">
              {contact.primaryPhone && (
                <Pressable onPress={() => handleCall(contact.primaryPhone!)} className="items-center active:opacity-50">
                  <View
                    className="w-11 h-11 rounded-full bg-background-50 border border-border-200 items-center justify-center mb-1"
                  >
                    <Phone size={18} color={getThemeColor(colors, "primary-600")} />
                  </View>
                  <Text className="text-typography-500 text-xs">Call</Text>
                </Pressable>
              )}
              {contact.primaryPhone && (
                <Pressable onPress={() => handleWhatsApp(contact.primaryPhone!)} className="items-center active:opacity-50">
                  <View
                    className="w-11 h-11 rounded-full bg-background-50 border border-border-200 items-center justify-center mb-1"
                  >
                    <WhatsAppIcon size={18} color={getThemeColor(colors, "primary-600")} />
                  </View>
                  <Text className="text-typography-500 text-xs">WhatsApp</Text>
                </Pressable>
              )}
              {contact.primaryEmail && (
                <Pressable onPress={() => handleEmail(contact.primaryEmail!)} className="items-center active:opacity-50">
                  <View
                    className="w-11 h-11 rounded-full bg-background-50 border border-border-200 items-center justify-center mb-1"
                  >
                    <Mail size={18} color={getThemeColor(colors, "primary-600")} />
                  </View>
                  <Text className="text-typography-500 text-xs">Email</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* Consolidated Details Card */}
        {(contact.primaryPhone || contact.primaryEmail || contact.location || contact.dateOfBirth || contact.notes) && (
          <View className="mx-4 mb-2 rounded-xl bg-background-50 border border-border-200 overflow-hidden">
            {(() => {
              const rows: React.ReactNode[] = [];

              if (contact.primaryPhone) {
                rows.push(
                  <View key="phone" className="flex-row items-center px-4 py-3">
                    <Phone size={16} color={getThemeColor(colors, "typography-400")} />
                    <View className="ml-3 flex-1">
                      <Text className="text-typography-400 text-xs">Phone</Text>
                      <Text className="text-typography-900 text-base">{contact.primaryPhone}</Text>
                    </View>
                  </View>
                );
              }

              if (contact.primaryEmail) {
                rows.push(
                  <Pressable
                    key="email"
                    onPress={() => handleEmail(contact.primaryEmail!)}
                    className="flex-row items-center px-4 py-3 active:bg-background-100"
                  >
                    <Mail size={16} color={getThemeColor(colors, "typography-400")} />
                    <View className="ml-3 flex-1">
                      <Text className="text-typography-400 text-xs">Email</Text>
                      <Text className="text-typography-900 text-base">{contact.primaryEmail}</Text>
                    </View>
                  </Pressable>
                );
              }

              if (contact.location) {
                rows.push(
                  <View key="location" className="flex-row items-start px-4 py-3">
                    <MapPin size={16} color={getThemeColor(colors, "typography-400")} className="mt-0.5" />
                    <View className="ml-3 flex-1">
                      <Text className="text-typography-400 text-xs">Location</Text>
                      <Text className="text-typography-900 text-base">{contact.location}</Text>
                    </View>
                  </View>
                );
              }

              if (contact.dateOfBirth) {
                rows.push(
                  <View key="birthday" className="flex-row items-center px-4 py-3">
                    <Cake size={16} color={getThemeColor(colors, "typography-400")} />
                    <View className="ml-3 flex-1">
                      <Text className="text-typography-400 text-xs">Birthday</Text>
                      <Text className="text-typography-900 text-base">
                        {format(new Date(contact.dateOfBirth), "MMMM d, yyyy")}
                      </Text>
                    </View>
                  </View>
                );
              }

              if (contact.notes) {
                rows.push(
                  <View key="notes" className="flex-row items-start px-4 py-3">
                    <StickyNote size={16} color={getThemeColor(colors, "typography-400")} className="mt-0.5" />
                    <View className="ml-3 flex-1">
                      <Text className="text-typography-400 text-xs">Notes</Text>
                      <Text className="text-typography-900 text-base" numberOfLines={2}>
                        {contact.notes}
                      </Text>
                    </View>
                  </View>
                );
              }

              return rows.map((row, i) => (
                <View key={i}>
                  {i > 0 && <View className="border-b border-border-200 mx-4" />}
                  {row}
                </View>
              ));
            })()}
          </View>
        )}

        {/* Conversations */}
        <View className="px-4 mt-6">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-typography-900 text-base font-body-semibold">Conversations</Text>
            <Pressable
              onPress={() => router.push(`/conversation/new?contactId=${id}`)}
              className="p-1 active:opacity-50"
            >
              <Plus size={20} color={getThemeColor(colors, "primary-600")} />
            </Pressable>
          </View>

          {isLoadingConversations ? (
            <View className="py-8 items-center">
              <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
            </View>
          ) : conversations.length === 0 ? (
            <View className="flex-row items-center py-2">
              <MessageCircle size={16} color={getThemeColor(colors, "typography-400")} />
              <Text className="text-typography-400 text-sm ml-2">No conversations yet</Text>
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
                          <Text className="text-typography-900 text-sm font-body-semibold">
                            {medium.label}
                          </Text>
                          <Text className="text-typography-400 text-xs ml-2">
                            {format(new Date(conversation.happenedAt), "MMM d, yyyy")}
                          </Text>
                        </View>
                        {conversation.content ? (
                          <Text className="text-typography-700 text-sm" numberOfLines={2}>
                            {conversation.content}
                          </Text>
                        ) : (
                          <Text className="text-typography-400 text-sm italic">No notes</Text>
                        )}
                      </View>
                    </View>
                  </Pressable>
                );
              })}

              {hasMoreConversations && (
                <Pressable
                  onPress={() => conversationsQuery.fetchNextPage()}
                  disabled={isLoadingMoreConversations}
                  className="mt-1 py-3 rounded-lg bg-background-100 active:bg-background-200"
                >
                  {isLoadingMoreConversations ? (
                    <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
                  ) : (
                    <Text className="text-primary-600 text-center text-sm font-body-medium">
                      Load more conversations
                    </Text>
                  )}
                </Pressable>
              )}
            </>
          )}
        </View>

        {/* Reminders */}
        <View className="px-4 mt-6">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-typography-900 text-base font-body-semibold">Reminders</Text>
            <Pressable
              onPress={() => router.push(`/reminder/new?contactId=${id}`)}
              className="p-1 active:opacity-50"
            >
              <Plus size={20} color={getThemeColor(colors, "primary-600")} />
            </Pressable>
          </View>

          {isLoadingReminders ? (
            <View className="py-8 items-center">
              <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
            </View>
          ) : reminders.length === 0 ? (
            <View className="flex-row items-center py-2">
              <Bell size={16} color={getThemeColor(colors, "typography-400")} />
              <Text className="text-typography-400 text-sm ml-2">No reminders yet</Text>
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
                          <Text className="text-typography-900 text-sm font-body-semibold flex-1" numberOfLines={1}>
                            {reminder.title}
                          </Text>
                          <Text className="text-typography-400 text-xs ml-2">{dueLabel}</Text>
                        </View>
                        {reminder.notes ? (
                          <Text className="text-typography-700 text-sm" numberOfLines={2}>
                            {reminder.notes}
                          </Text>
                        ) : (
                          <Text className="text-typography-400 text-sm italic">No notes</Text>
                        )}
                      </View>
                    </View>
                  </Pressable>
                );
              })}

              {hasMoreReminders && (
                <Pressable
                  onPress={() => remindersQuery.fetchNextPage()}
                  disabled={isLoadingMoreReminders}
                  className="mt-1 py-3 rounded-lg bg-background-100 active:bg-background-200"
                >
                  {isLoadingMoreReminders ? (
                    <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
                  ) : (
                    <Text className="text-primary-600 text-center text-sm font-body-medium">
                      Load more reminders
                    </Text>
                  )}
                </Pressable>
              )}
            </>
          )}
        </View>

        {/* Relationships */}
        <View className="px-4 mt-6">
          <View className="mb-3 flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Text className="text-typography-900 text-base font-body-semibold">Relationships</Text>
              {relationships.length > 0 && (
                <Pressable
                  onPress={() => setShowFullscreenGraph(true)}
                  className="p-1 ml-2 active:opacity-50"
                >
                  <Maximize2 size={16} color={getThemeColor(colors, "primary-600")} />
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => router.push(`/relationship/new?contactId=${id}`)}
              className="p-1 active:opacity-50"
            >
              <Plus size={20} color={getThemeColor(colors, "primary-600")} />
            </Pressable>
          </View>

          {isLoadingRelationships ? (
            <View className="py-8 items-center">
              <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
            </View>
          ) : relationships.length === 0 ? (
            <View className="flex-row items-center py-2">
              <GitFork size={16} color={getThemeColor(colors, "typography-400")} />
              <Text className="text-typography-400 text-sm ml-2">No relationships yet</Text>
            </View>
          ) : (
            <>
              <View className="mb-3 rounded-xl overflow-hidden border border-border-200 bg-background-50">
                <RelationshipGraph
                  contactId={id}
                  contactName={contact.displayName}
                  relationships={relationships}
                  width={windowWidth - 32}
                  height={240}
                  onNodePress={(nodeId) =>
                    router.push({
                      pathname: "/contact/[id]",
                      params: { id: nodeId, from: `/contact/${id}` },
                    })
                  }
                />
              </View>

              {relationships.map((rel) => {
                const isFrom = rel.fromContactId === id;
                const otherName = isFrom
                  ? rel.toContact?.displayName || "Unknown"
                  : rel.fromContact?.displayName || "Unknown";
                const otherId = isFrom ? rel.toContactId : rel.fromContactId;
                const typeName = rel.type?.name || "Related";

                return (
                  <Pressable
                    key={rel.id}
                    onPress={() =>
                      router.push({
                        pathname: "/contact/[id]",
                        params: { id: otherId, from: `/contact/${id}` },
                      })
                    }
                    className="mb-3 p-4 rounded-xl border border-border-200 bg-background-50 active:bg-background-100"
                  >
                    <View className="flex-row items-center">
                      <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mr-3">
                        <GitFork size={18} color={getThemeColor(colors, "primary-600")} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-typography-900 text-sm font-body-semibold">{typeName}</Text>
                        <Text className="text-typography-600 text-sm">{otherName}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </>
          )}
        </View>

        <View className="h-8" />
      </ScrollView>

      {contact && (
        <RelationshipGraphFullscreen
          visible={showFullscreenGraph}
          onClose={() => setShowFullscreenGraph(false)}
          contactId={id}
          contactName={contact.displayName}
          relationships={relationships}
          onNodePress={(nodeId) =>
            router.push({
              pathname: "/contact/[id]",
              params: { id: nodeId, from: `/contact/${id}` },
            })
          }
        />
      )}
    </SafeAreaView>
  );
}
