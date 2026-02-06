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
import { contactsApi, Contact } from "../../../lib/api";
import { getThemeColor, useThemeColors } from "../../../lib/theme";

export default function EditContactScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const placeholderColor = getThemeColor(colors, "typography-500");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    displayName: "",
    company: "",
    jobTitle: "",
    primaryPhone: "",
    primaryEmail: "",
    notes: "",
  });

  useEffect(() => {
    loadContact();
  }, [id]);

  const loadContact = async () => {
    try {
      setIsLoading(true);
      const contact = await contactsApi.get(id);
      setFormData({
        displayName: contact.displayName || "",
        company: contact.company || "",
        jobTitle: contact.jobTitle || "",
        primaryPhone: contact.primaryPhone || "",
        primaryEmail: contact.primaryEmail || "",
        notes: contact.notes || "",
      });
    } catch (error) {
      console.error("Failed to load contact:", error);
      Alert.alert("Error", "Failed to load contact");
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.displayName.trim()) {
      Alert.alert("Error", "Name is required");
      return;
    }

    try {
      setIsSubmitting(true);
      await contactsApi.update(id, {
        displayName: formData.displayName.trim(),
        company: formData.company.trim() || undefined,
        jobTitle: formData.jobTitle.trim() || undefined,
        primaryPhone: formData.primaryPhone.trim() || undefined,
        primaryEmail: formData.primaryEmail.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      });
      router.back();
    } catch (error) {
      console.error("Failed to update contact:", error);
      Alert.alert("Error", "Failed to update contact");
    } finally {
      setIsSubmitting(false);
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
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-200">
        <Pressable onPress={() => router.back()} className="p-2">
          <Text className="text-primary-600 text-base">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-semibold text-typography-900">Edit Contact</Text>
        <Pressable
          onPress={handleSubmit}
          disabled={isSubmitting}
          className="p-2"
        >
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
        {/* Name */}
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">
            Name *
          </Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="John Doe"
            placeholderTextColor={placeholderColor}
            value={formData.displayName}
            onChangeText={(text) =>
              setFormData({ ...formData, displayName: text })
            }
            autoCapitalize="words"
          />
        </View>

        {/* Company */}
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">
            Company
          </Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="Acme Inc"
            placeholderTextColor={placeholderColor}
            value={formData.company}
            onChangeText={(text) => setFormData({ ...formData, company: text })}
            autoCapitalize="words"
          />
        </View>

        {/* Job Title */}
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">
            Job Title
          </Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="Software Engineer"
            placeholderTextColor={placeholderColor}
            value={formData.jobTitle}
            onChangeText={(text) =>
              setFormData({ ...formData, jobTitle: text })
            }
            autoCapitalize="words"
          />
        </View>

        {/* Phone */}
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Phone</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="+1 (555) 123-4567"
            placeholderTextColor={placeholderColor}
            value={formData.primaryPhone}
            onChangeText={(text) =>
              setFormData({ ...formData, primaryPhone: text })
            }
            keyboardType="phone-pad"
          />
        </View>

        {/* Email */}
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Email</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="john@example.com"
            placeholderTextColor={placeholderColor}
            value={formData.primaryEmail}
            onChangeText={(text) =>
              setFormData({ ...formData, primaryEmail: text })
            }
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Notes */}
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-medium mb-2">Notes</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="Add notes..."
            placeholderTextColor={placeholderColor}
            value={formData.notes}
            onChangeText={(text) => setFormData({ ...formData, notes: text })}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
