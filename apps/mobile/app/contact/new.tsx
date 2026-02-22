import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { useCreateContact } from "../../hooks/use-contacts";

export default function NewContactScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const placeholderColor = getThemeColor(colors, "typography-500");
  const createContact = useCreateContact();
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(
    null
  );
  const [formData, setFormData] = useState({
    displayName: "",
    company: "",
    jobTitle: "",
    primaryPhone: "",
    primaryEmail: "",
    notes: "",
  });

  const pickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission Required",
          "Photo library permission is required to select a contact avatar."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0]);
      }
    } catch (error) {
      console.error("Failed to pick image:", error);
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
  };

  const handleSubmit = async () => {
    if (!formData.displayName.trim()) {
      Alert.alert("Error", "Name is required");
      return;
    }

    try {
      await createContact.mutateAsync({
        data: {
          displayName: formData.displayName.trim(),
          company: formData.company.trim() || undefined,
          jobTitle: formData.jobTitle.trim() || undefined,
          primaryPhone: formData.primaryPhone.trim() || undefined,
          primaryEmail: formData.primaryEmail.trim() || undefined,
          notes: formData.notes.trim() || undefined,
        },
        image:
          selectedImage?.base64
            ? {
                base64Data: selectedImage.base64,
                contentType: selectedImage.mimeType || "image/jpeg",
                fileName: selectedImage.fileName || `contact-${Date.now()}.jpg`,
              }
            : undefined,
      });

      router.back();
    } catch (error) {
      console.error("Failed to create contact:", error);
      Alert.alert("Error", "Failed to create contact");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-200">
        <Pressable onPress={() => router.back()} className="p-2">
          <Text className="text-primary-600 text-base">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-body-semibold text-typography-900">New Contact</Text>
        <Pressable
          onPress={handleSubmit}
          disabled={createContact.isPending}
          className="p-2"
        >
          <Text
            className={`text-base ${
              createContact.isPending ? "text-typography-400" : "text-primary-600"
            }`}
          >
            {createContact.isPending ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4 py-6">
        {/* Avatar */}
        <View className="items-center mb-6">
          {selectedImage?.uri ? (
            <Image source={{ uri: selectedImage.uri }} className="w-24 h-24 rounded-full mb-3" />
          ) : (
            <View className="w-24 h-24 rounded-full bg-primary-100 items-center justify-center mb-3">
              <Text className="text-primary-700 text-4xl font-body-semibold">
                {(formData.displayName.trim().charAt(0) || "?").toUpperCase()}
              </Text>
            </View>
          )}
          <View className="flex-row">
            <Pressable
              onPress={pickImage}
              className="px-4 py-2 bg-primary-600 rounded-lg"
            >
              <Text className="text-white font-body-medium">
                {selectedImage ? "Change Photo" : "Choose Photo"}
              </Text>
            </Pressable>
            {selectedImage && (
              <Pressable
                onPress={clearImage}
                className="px-4 py-2 bg-background-100 rounded-lg ml-2 border border-border-200"
              >
                <Text className="text-typography-700 font-body-medium">Remove</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Name */}
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">Name *</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="John Doe"
            placeholderTextColor={placeholderColor}
            value={formData.displayName}
            onChangeText={(text) => setFormData({ ...formData, displayName: text })}
            autoCapitalize="words"
          />
        </View>

        {/* Company */}
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">Company</Text>
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
          <Text className="text-typography-700 text-sm font-body-medium mb-2">Job Title</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="Software Engineer"
            placeholderTextColor={placeholderColor}
            value={formData.jobTitle}
            onChangeText={(text) => setFormData({ ...formData, jobTitle: text })}
            autoCapitalize="words"
          />
        </View>

        {/* Phone */}
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">Phone</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="+1 (555) 123-4567"
            placeholderTextColor={placeholderColor}
            value={formData.primaryPhone}
            onChangeText={(text) => setFormData({ ...formData, primaryPhone: text })}
            keyboardType="phone-pad"
          />
        </View>

        {/* Email */}
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">Email</Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            placeholder="john@example.com"
            placeholderTextColor={placeholderColor}
            value={formData.primaryEmail}
            onChangeText={(text) => setFormData({ ...formData, primaryEmail: text })}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Notes */}
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">Notes</Text>
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
