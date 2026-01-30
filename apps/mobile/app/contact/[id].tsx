import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { contactsApi, Contact } from "../../lib/api";

export default function ContactDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [contact, setContact] = useState<Contact | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadContact();
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
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      </SafeAreaView>
    );
  }

  if (!contact) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-500">Contact not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200">
        <Pressable onPress={() => router.back()} className="p-2">
          <Text className="text-primary-600 text-base">← Back</Text>
        </Pressable>
        <Text className="text-lg font-semibold text-gray-900">Contact</Text>
        <Pressable
          onPress={() => router.push(`/contact/${id}/edit`)}
          className="p-2"
        >
          <Text className="text-primary-600 text-base">Edit</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1">
        {/* Avatar & Name */}
        <View className="items-center py-8 bg-gray-50">
          <View className="w-24 h-24 rounded-full bg-primary-100 items-center justify-center mb-4">
            <Text className="text-primary-700 text-4xl font-semibold">
              {contact.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text className="text-2xl font-bold text-gray-900 mb-1">
            {contact.displayName}
          </Text>
          {(contact.company || contact.jobTitle) && (
            <Text className="text-gray-500 text-base">
              {[contact.jobTitle, contact.company].filter(Boolean).join(" at ")}
            </Text>
          )}
        </View>

        {/* Tags */}
        {contact.tags && contact.tags.length > 0 && (
          <View className="px-4 py-4 border-b border-gray-200">
            <Text className="text-gray-500 text-sm font-medium mb-2">Tags</Text>
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
              <Text className="text-gray-500 text-sm font-medium mb-2">
                Phone
              </Text>
              <Pressable
                onPress={() => handleCall(contact.primaryPhone!)}
                className="flex-row items-center justify-between py-3 px-4 bg-gray-50 rounded-lg active:bg-gray-100"
              >
                <Text className="text-gray-900 text-base">
                  {contact.primaryPhone}
                </Text>
                <Text className="text-primary-600 text-base">Call</Text>
              </Pressable>
            </View>
          )}

          {/* Email */}
          {contact.primaryEmail && (
            <View className="mb-4">
              <Text className="text-gray-500 text-sm font-medium mb-2">
                Email
              </Text>
              <Pressable
                onPress={() => handleEmail(contact.primaryEmail!)}
                className="flex-row items-center justify-between py-3 px-4 bg-gray-50 rounded-lg active:bg-gray-100"
              >
                <Text className="text-gray-900 text-base">
                  {contact.primaryEmail}
                </Text>
                <Text className="text-primary-600 text-base">Email</Text>
              </Pressable>
            </View>
          )}

          {/* Birthday */}
          {contact.dateOfBirth && (
            <View className="mb-4">
              <Text className="text-gray-500 text-sm font-medium mb-2">
                Birthday
              </Text>
              <View className="py-3 px-4 bg-gray-50 rounded-lg">
                <Text className="text-gray-900 text-base">
                  {new Date(contact.dateOfBirth).toLocaleDateString()}
                </Text>
              </View>
            </View>
          )}

          {/* Notes */}
          {contact.notes && (
            <View className="mb-4">
              <Text className="text-gray-500 text-sm font-medium mb-2">
                Notes
              </Text>
              <View className="py-3 px-4 bg-gray-50 rounded-lg">
                <Text className="text-gray-900 text-base">{contact.notes}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Delete Button */}
        <View className="px-4 py-8">
          <Pressable
            onPress={handleDelete}
            className="py-3 px-4 bg-red-50 rounded-lg active:bg-red-100"
          >
            <Text className="text-red-600 text-center font-semibold">
              Delete Contact
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
