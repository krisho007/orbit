import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Bell,
  CalendarDays,
  Download,
  MessageCircle,
  Mic,
  Phone,
  Sparkles,
  Users,
} from "lucide-react-native";
import { useAuth } from "../../lib/auth";
import { markAppOnboardingComplete, onboardingVersion } from "../../lib/onboarding";
import { getThemeColor, useThemeColors } from "../../lib/theme";

type OnboardingStep = {
  title: string;
  description: string;
  visualTitle: string;
  visualSubtitle: string;
  chips: string[];
  icon: ComponentType<{ size?: number; color?: string }>;
};

const STEPS: OnboardingStep[] = [
  {
    title: "Start with your contacts",
    description:
      "Import Google Contacts now, or continue and do it later from Settings.",
    visualTitle: "Google Import",
    visualSubtitle: "Bring your network into Orbit in one pass.",
    chips: ["Dedupes by phone", "Keeps richer names", "Optional photos"],
    icon: Download,
  },
  {
    title: "Easily log your conversations",
    description:
      "Tap the mic in Orbit Assistant and log conversations in seconds.",
    visualTitle: "Voice capture",
    visualSubtitle: "Speak naturally, Orbit structures it for you.",
    chips: ["Mic to transcript", "Creates conversation", "Search later"],
    icon: Mic,
  },
  {
    title: "Add reminders to contacts",
    description:
      "Set due dates and recurring follow-ups tied to the right people.",
    visualTitle: "Contact reminders",
    visualSubtitle: "Never miss a follow-up.",
    chips: ["Due dates", "Recurrence", "Participant linking"],
    icon: Bell,
  },
  {
    title: "See everything in one place",
    description:
      "Open a contact to view their conversations and reminders together.",
    visualTitle: "Unified contact timeline",
    visualSubtitle: "Contacts, conversations, and reminders connected.",
    chips: ["Contacts tab", "Conversations tab", "Reminders tab"],
    icon: Users,
  },
];

function parseStep(value: string | string[] | undefined): number {
  const first = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(first ?? "0", 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), STEPS.length - 1);
}

export default function WelcomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ step?: string }>();
  const colors = useThemeColors();
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(() => parseStep(params.step));

  const currentStep = STEPS[step];
  const isFirstStep = step === 0;
  const isLastStep = step === STEPS.length - 1;
  const primaryLabel = isLastStep ? "Finish" : "Next";

  const progress = useMemo(
    () => `${step + 1} / ${STEPS.length}`,
    [step]
  );

  const completeOnboarding = async () => {
    if (!user?.id) {
      router.replace("/(tabs)/assistant");
      return;
    }

    setIsFinishing(true);
    setError(null);

    try {
      await markAppOnboardingComplete(user.id, onboardingVersion);
      router.replace("/(tabs)/assistant");
    } catch (err) {
      console.error("Failed to complete onboarding:", err);
      setError("Could not continue. Please try again.");
    } finally {
      setIsFinishing(false);
    }
  };

  const handlePrimary = async () => {
    if (isLastStep) {
      await completeOnboarding();
      return;
    }

    setStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    setError(null);
  };

  const handleBack = () => {
    if (isFirstStep) return;
    setStep((prev) => Math.max(prev - 1, 0));
    setError(null);
  };

  const handleImport = () => {
    router.push({
      pathname: "/google-import" as any,
      params: { entry: "onboarding" },
    });
  };

  const VisualIcon = currentStep.icon;
  const isConversationPreview = step === 1;
  const isReminderPreview = step === 2;
  const isContactDetailPreview = step === 3;

  return (
    <SafeAreaView className="flex-1 bg-background-50">
      <View className="flex-1 px-6 py-6 justify-between">
        <View>
          <View className="flex-row items-center justify-between mb-5">
            <View className="w-11 h-11 rounded-2xl bg-primary-600 items-center justify-center">
              <Sparkles size={20} color={getThemeColor(colors, "typography-0")} />
            </View>
            <Text className="text-typography-500 text-sm font-medium">{progress}</Text>
          </View>

          <Text className="text-typography-900 text-3xl font-bold mb-3">
            {currentStep.title}
          </Text>
          <Text className="text-typography-600 text-base leading-6 mb-5">
            {currentStep.description}
          </Text>

          <View className="bg-background-0 border border-border-200 rounded-3xl p-5 overflow-hidden">
            <View className="absolute -top-8 -right-8 w-20 h-20 rounded-full bg-primary-100" />
            <View className="absolute -bottom-8 -left-8 w-16 h-16 rounded-full bg-background-100" />

            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 rounded-2xl bg-primary-100 items-center justify-center mr-3">
                <VisualIcon size={18} color={getThemeColor(colors, "primary-600")} />
              </View>
              <View className="flex-1">
                <Text className="text-typography-900 text-base font-semibold">
                  {currentStep.visualTitle}
                </Text>
                <Text className="text-typography-600 text-sm mt-0.5">
                  {currentStep.visualSubtitle}
                </Text>
              </View>
            </View>

            {isConversationPreview ? (
              <View className="rounded-2xl border border-border-200 bg-background-50 p-3">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="w-7 h-7 rounded-xl bg-primary-100 items-center justify-center mr-2">
                    <Sparkles size={13} color={getThemeColor(colors, "primary-600")} />
                  </View>
                  <Text className="text-typography-800 text-xs font-semibold flex-1">Orbit Assistant</Text>
                  <Text className="text-typography-400 text-[10px]">Today</Text>
                </View>
                <View className="rounded-xl bg-primary-50 border border-primary-200 p-3 mb-2">
                  <Text className="text-primary-800 text-sm leading-5">
                    Talked with Parinder, neighbour. He has a boy (3rd standard) and girl (8th),
                    studying at Vidyaniketan School
                  </Text>
                </View>
                <View className="rounded-xl border border-border-200 bg-background-0 p-3">
                  <View className="flex-row items-center mb-1">
                    <View className="w-6 h-6 rounded-lg bg-primary-100 items-center justify-center mr-2">
                      <Phone size={12} color={getThemeColor(colors, "primary-600")} />
                    </View>
                    <Text className="text-typography-900 text-xs font-semibold">Parinder</Text>
                  </View>
                  <Text className="text-typography-500 text-[11px]">Phone Call · Feb 12</Text>
                </View>
              </View>
            ) : isReminderPreview ? (
              <View className="rounded-2xl border border-border-200 bg-background-50 p-3">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-typography-900 text-xs font-semibold">Reminders</Text>
                  <CalendarDays size={13} color={getThemeColor(colors, "typography-500")} />
                </View>
                <View className="rounded-xl border border-border-200 bg-background-0 p-3 mb-2">
                  <View className="flex-row items-start">
                    <View className="w-7 h-7 rounded-xl bg-primary-100 items-center justify-center mr-2">
                      <Bell size={12} color={getThemeColor(colors, "primary-600")} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-typography-900 text-xs font-semibold mb-1">
                        Call Parinder
                      </Text>
                      <Text className="text-typography-500 text-[11px] mb-2">Due Feb 12 · Open</Text>
                      <Text className="text-typography-700 text-xs leading-5">
                        Remind me to call Parinder on 12th Feb to followup on getting a reference
                        at Google.
                      </Text>
                    </View>
                  </View>
                </View>
                <View className="rounded-xl bg-primary-50 border border-primary-200 p-3">
                  <Text className="text-primary-800 text-sm leading-5">
                    Remind me to call Parinder on 12th Feb to followup on getting a reference at
                    Google.
                  </Text>
                </View>
              </View>
            ) : isContactDetailPreview ? (
              <View className="rounded-2xl border border-border-200 bg-background-50 p-3">
                <Text className="text-typography-900 text-sm font-semibold mb-2">Parinder</Text>

                <View className="mb-2">
                  <Text className="text-typography-500 text-[11px] font-semibold mb-1">
                    Conversations
                  </Text>
                  <View className="rounded-xl border border-border-200 bg-background-0 p-3">
                    <View className="flex-row items-center mb-1">
                      <MessageCircle size={12} color={getThemeColor(colors, "primary-600")} />
                      <Text className="text-typography-900 text-xs font-semibold ml-2">
                        Phone Call · Feb 12
                      </Text>
                    </View>
                    <Text className="text-typography-700 text-xs leading-5">
                      Talked with Parinder, neighbour. He has a boy (3rd standard) and girl (8th),
                      studying at Vidyaniketan School
                    </Text>
                  </View>
                </View>

                <View>
                  <Text className="text-typography-500 text-[11px] font-semibold mb-1">
                    Reminders
                  </Text>
                  <View className="rounded-xl border border-border-200 bg-background-0 p-3">
                    <View className="flex-row items-center mb-1">
                      <Bell size={12} color={getThemeColor(colors, "primary-600")} />
                      <Text className="text-typography-900 text-xs font-semibold ml-2">
                        Call Parinder · Feb 12
                      </Text>
                    </View>
                    <Text className="text-typography-700 text-xs leading-5">
                      Remind me to call Parinder on 12th Feb to followup on getting a reference
                      at Google.
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View className="flex-row flex-wrap">
                {currentStep.chips.map((chip) => (
                  <View
                    key={chip}
                    className="rounded-full border border-border-200 bg-background-50 px-3 py-1.5 mr-2 mb-2"
                  >
                    <Text className="text-typography-700 text-xs font-medium">{chip}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View className="mt-4 flex-row items-center justify-center">
            {STEPS.map((_, index) => {
              const isActive = index === step;
              return (
                <View
                  key={`dot-${index}`}
                  className={`h-2 rounded-full mx-1 ${
                    isActive ? "w-6 bg-primary-600" : "w-2 bg-border-300"
                  }`}
                />
              );
            })}
          </View>
        </View>

        <View>
          {error && (
            <View className="mb-4 p-3 bg-background-error border border-error-100 rounded-xl">
              <Text className="text-error-600 text-center">{error}</Text>
            </View>
          )}

          {isFirstStep && (
            <Pressable
              onPress={handleImport}
              disabled={isFinishing}
              className="w-full py-4 rounded-2xl bg-primary-600 items-center mb-3"
              style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
            >
              <Text className="text-typography-0 text-base font-semibold">Import from Google</Text>
            </Pressable>
          )}

          <View className="flex-row items-center mb-3">
            <Pressable
              onPress={handleBack}
              disabled={isFirstStep || isFinishing}
              className={`flex-1 py-4 rounded-2xl border items-center mr-2 ${
                isFirstStep
                  ? "border-border-100 bg-background-50"
                  : "border-border-200 bg-background-0"
              }`}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              <Text
                className={`text-base font-semibold ${
                  isFirstStep ? "text-typography-400" : "text-typography-700"
                }`}
              >
                Back
              </Text>
            </Pressable>
            <Pressable
              onPress={handlePrimary}
              disabled={isFinishing}
              className="flex-1 py-4 rounded-2xl bg-primary-600 items-center ml-2 active:bg-primary-700"
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              {isFinishing ? (
                <ActivityIndicator size="small" color={getThemeColor(colors, "typography-0")} />
              ) : (
                <Text className="text-typography-0 text-base font-semibold">{primaryLabel}</Text>
              )}
            </Pressable>
          </View>

          {!isLastStep && (
            <Pressable
              onPress={completeOnboarding}
              disabled={isFinishing}
              className="w-full py-3 rounded-2xl items-center"
              style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
            >
              <Text className="text-typography-500 text-base font-medium">Skip for now</Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
