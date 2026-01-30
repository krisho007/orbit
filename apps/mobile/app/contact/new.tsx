import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { contactsApi } from "../../lib/api";

export default function NewContactScreen() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    displayName: "",
    company: "",
    jobTitle: "",
    primaryPhone: "",
    primaryEmail: "",
    notes: "",
  });

  const handleSubmit = async () => {
    if (!formData.displayName.trim()) {
      Alert.alert("Error", "Name is required");
      return;
    }

    try {
      setIsSubmitting(true);
      await contactsApi.create({
        displayName: formData.displayName.trim(),
        company: formData.company.trim() || undefined,
        jobTitle: formData.jobTitle.trim() || undefined,
        primaryPhone: formData.primaryPhone.trim() || undefined,
        primaryEmail: formData.primaryEmail.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      });
      router.back();
    } catch (error) {
      console.error("Failed to create contact:", error);
      Alert.alert("Error", "Failed to create contact");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200">
        <Pressable onPress={() => router.back()} className="p-2">
          <Text className="text-primary-600 text-base">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-semibold text-gray-900">New Contact</Text>
        <Pressable
          onPress={handleSubmit}
          disabled={isSubmitting}
          className="p-2"
        >
          <Text
            className={`text-base ${
              isSubmitting ? "text-gray-400" : "text-primary-600"
            }`}
          >
            {isSubmitting ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4 py-6">
        {/* Name */}
        <View className="mb-4">
          <Text className="text-gray-700 text-sm font-medium mb-2">
            Name *
          </Text>
          <TextInput
            className="px-4 py-3 bg-gray-50 rounded-lg text-gray-900 text-base border border-gray-200"
            placeholder="John Doe"
            value={formData.displayName}
            onChangeText={(text) =>
              setFormData({ ...formData, displayName: text })
            }
            autoCapitalize="words"
          />
        </View>

        {/* Company */}
        <View className="mb-4">
          <Text className="text-gray-700 text-sm font-medium mb-2">
            Company
          </Text>
          <TextInput
            className="px-4 py-3 bg-gray-50 rounded-lg text-gray-900 text-base border border-gray-200"
            placeholder="Acme Inc"
            value={formData.company}
            onChangeText={(text) => setFormData({ ...formData, company: text })}
            autoCapitalize="words"
          />
        </View>

        {/* Job Title */}
        <View className="mb-4">
          <Text className="text-gray-700 text-sm font-medium mb-2">
            Job Title
          </Text>
          <TextInput
            className="px-4 py-3 bg-gray-50 rounded-lg text-gray-900 text-base border border-gray-200"
            placeholder="Software Engineer"
            value={formData.jobTitle}
            onChangeText={(text) =>
              setFormData({ ...formData, jobTitle: text })
            }
            autoCapitalize="words"
          />
        </View>

        {/* Phone */}
        <View className="mb-4">
          <Text className="text-gray-700 text-sm font-medium mb-2">Phone</Text>
          <TextInput
            className="px-4 py-3 bg-gray-50 rounded-lg text-gray-900 text-base border border-gray-200"
            placeholder="+1 (555) 123-4567"
            value={formData.primaryPhone}
            onChangeText={(text) =>
              setFormData({ ...formData, primaryPhone: text })
            }
            keyboardType="phone-pad"
          />
        </View>

        {/* Email */}
        <View className="mb-4">
          <Text className="text-gray-700 text-sm font-medium mb-2">Email</Text>
          <TextInput
            className="px-4 py-3 bg-gray-50 rounded-lg text-gray-900 text-base border border-gray-200"
            placeholder="john@example.com"
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
          <Text className="text-gray-700 text-sm font-medium mb-2">Notes</Text>
          <TextInput
            className="px-4 py-3 bg-gray-50 rounded-lg text-gray-900 text-base border border-gray-200"
            placeholder="Add notes..."
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
