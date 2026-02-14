import { View, Text, ScrollView, Pressable, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, ExternalLink } from "lucide-react-native";
import { getThemeColor, useThemeColors } from "../lib/theme";

const THIRD_PARTY_SERVICES = [
  {
    name: "Supabase",
    purpose: "Database, authentication, and file storage",
    dataShared: "Account info, all CRM data, uploaded photos",
    policyUrl: "https://supabase.com/privacy",
  },
  {
    name: "Google Gemini",
    purpose: "AI assistant — processes your queries",
    dataShared: "Contact names, conversation content, event details",
    policyUrl: "https://policies.google.com/privacy",
  },
  {
    name: "Sarvam AI",
    purpose: "Speech-to-text transcription",
    dataShared: "Audio recordings from the voice input feature",
    policyUrl: "https://www.sarvam.ai/privacy-policy",
  },
];

const DATA_COLLECTED = [
  "Name and email address (from your Google account)",
  "Contacts: name, phone, email, date of birth, notes, photos",
  "Conversations: content, medium, participants, dates",
  "Events: title, description, location, participants, dates",
  "Reminders: title, notes, due dates, participants",
  "Relationships between contacts",
  "Audio recordings (temporarily, for speech-to-text)",
];

export default function DataPrivacyScreen() {
  const router = useRouter();
  const colors = useThemeColors();

  return (
    <SafeAreaView className="flex-1 bg-background-50" edges={["top"]}>
      <View className="flex-row items-center px-4 py-3 border-b border-border-100 bg-background-0">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-xl items-center justify-center mr-3 active:bg-background-100"
        >
          <ArrowLeft size={20} color={getThemeColor(colors, "typography-700")} />
        </Pressable>
        <Text className="text-typography-900 text-lg font-semibold">Data & Third Parties</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View className="bg-background-0 rounded-2xl border border-border-100 p-5 mb-6">
          <Text className="text-typography-900 text-base font-semibold mb-3">
            Data We Collect
          </Text>
          <Text className="text-typography-600 text-sm mb-4">
            Orbit stores the following data to provide its CRM functionality:
          </Text>
          {DATA_COLLECTED.map((item, index) => (
            <View key={index} className="flex-row mb-2">
              <Text className="text-typography-500 text-sm mr-2">•</Text>
              <Text className="text-typography-700 text-sm flex-1">{item}</Text>
            </View>
          ))}
        </View>

        <Text className="text-typography-900 text-base font-semibold mb-3 px-1">
          Third-Party Services
        </Text>
        <Text className="text-typography-600 text-sm mb-4 px-1">
          Your data may be processed by the following services. Each has its own privacy policy governing how they handle your data.
        </Text>

        {THIRD_PARTY_SERVICES.map((service) => (
          <View
            key={service.name}
            className="bg-background-0 rounded-2xl border border-border-100 p-5 mb-4"
          >
            <Text className="text-typography-900 text-base font-semibold mb-1">
              {service.name}
            </Text>
            <Text className="text-typography-600 text-sm mb-2">{service.purpose}</Text>
            <Text className="text-typography-500 text-sm mb-3">
              Data shared: {service.dataShared}
            </Text>
            <Pressable
              onPress={() => Linking.openURL(service.policyUrl)}
              className="flex-row items-center active:opacity-70"
            >
              <ExternalLink size={14} color={getThemeColor(colors, "primary-600")} />
              <Text className="text-primary-600 text-sm ml-1.5">Privacy Policy</Text>
            </Pressable>
          </View>
        ))}

        <View className="bg-background-0 rounded-2xl border border-border-100 p-5 mt-2">
          <Text className="text-typography-900 text-sm font-semibold mb-2">Your Rights</Text>
          <Text className="text-typography-600 text-sm leading-5">
            You can export all your data or delete your account at any time from Settings.
            You can also control whether third-party AI processing is enabled
            via the consent toggle in Settings → Data & Privacy.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
