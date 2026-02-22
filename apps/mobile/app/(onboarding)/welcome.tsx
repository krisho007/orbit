import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Bell,
  MessageCircle,
  Mic,
  Phone,
  Search,
  Send,
} from "lucide-react-native";
import { useAuth } from "../../lib/auth";
import { markAppOnboardingComplete, onboardingVersion } from "../../lib/onboarding";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { HuskyLogo } from "../../components/HuskyLogo";
import { useOnboarding } from "../_layout";

type OnboardingStep = {
  title: string;
  description: string;
};

const STEPS: OnboardingStep[] = [
  {
    title: "Start with your contacts",
    description:
      "Import Google Contacts now, or continue and do it later from Settings.",
  },
  {
    title: "Easily log your conversations",
    description:
      "Tap the mic in Orbit Assistant and log conversations in seconds.",
  },
  {
    title: "Add reminders to contacts",
    description:
      "Set due dates and recurring follow-ups tied to the right people.",
  },
  {
    title: "See everything in one place",
    description:
      "Open a contact to view their conversations and reminders together.",
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
  const { markOnboardingComplete } = useOnboarding();
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(() => parseStep(params.step));

  const currentStep = STEPS[step];
  const isFirstStep = step === 0;
  const isLastStep = step === STEPS.length - 1;
  const primaryLabel = isLastStep ? "Continue to Orbit" : "Next";
  const progress = `${step + 1} / ${STEPS.length}`;
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const completeOnboarding = async () => {
    if (!user?.id) {
      router.replace("/(tabs)/assistant");
      return;
    }

    setIsFinishing(true);
    setError(null);

    try {
      await markAppOnboardingComplete(user.id, onboardingVersion);
      markOnboardingComplete();
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

  const primary600 = getThemeColor(colors, "primary-600");
  const typo0 = getThemeColor(colors, "typography-0");
  const typo400 = getThemeColor(colors, "typography-400");
  const typo500 = getThemeColor(colors, "typography-500");

  return (
    <SafeAreaView className="flex-1 bg-background-50">
      {/* Header + Title */}
      <View className="px-6 pt-6 pb-2">
        <View className="flex-row items-center justify-between mb-4">
          <HuskyLogo size={32} color={primary600} />
          <Text className="text-typography-500 text-sm font-body-medium">{progress}</Text>
        </View>

        <Text className="text-typography-900 text-2xl font-heading-bold mb-1">
          {currentStep.title}
        </Text>
        <Text className="text-typography-600 text-sm leading-5">
          {currentStep.description}
        </Text>
      </View>

      {/* Preview mockup — fills available space */}
      <View className="flex-1 px-6 py-3">
        <View className="flex-1 rounded-3xl bg-background-0 border border-border-200 overflow-hidden">
          {step === 0 && (
            <ContactsPreview primary600={primary600} />
          )}
          {step === 1 && (
            <AssistantPreview primary600={primary600} typo0={typo0} typo400={typo400} typo500={typo500} today={today} />
          )}
          {step === 2 && (
            <RemindersPreview primary600={primary600} typo500={typo500} today={today} />
          )}
          {step === 3 && (
            <ContactDetailPreview primary600={primary600} typo500={typo500} today={today} />
          )}
        </View>
      </View>

      {/* Progress dots */}
      <View
        className="flex-row items-center justify-center py-3"
        accessibilityLabel={`Step ${step + 1} of ${STEPS.length}`}
      >
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

      {/* Buttons */}
      <View className="px-6 pb-4">
        {error && (
          <View className="mb-3 p-3 bg-background-error border border-error-100 rounded-xl">
            <Text className="text-error-600 text-center">{error}</Text>
          </View>
        )}

        {isFirstStep ? (
          <>
            <Pressable
              onPress={handleImport}
              disabled={isFinishing}
              className="w-full py-4 rounded-2xl bg-primary-600 items-center mb-3"
              style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Import from Google"
            >
              <Text className="text-typography-0 text-base font-body-semibold">Import from Google</Text>
            </Pressable>
            <Pressable
              onPress={handlePrimary}
              disabled={isFinishing}
              className="w-full py-4 rounded-2xl border border-border-200 bg-background-0 items-center mb-3"
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Next"
            >
              <Text className="text-typography-700 text-base font-body-semibold">Next</Text>
            </Pressable>
            <Pressable
              onPress={completeOnboarding}
              disabled={isFinishing}
              className="w-full py-2 rounded-2xl items-center"
              style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Skip import, show me around"
            >
              <Text className="text-typography-500 text-sm font-body-medium">Skip import, show me around</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View className="flex-row items-center mb-3">
              <Pressable
                onPress={handleBack}
                disabled={isFinishing}
                className="flex-1 py-4 rounded-2xl border border-border-200 bg-background-0 items-center mr-2"
                style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Text className="text-typography-700 text-base font-body-semibold">Back</Text>
              </Pressable>
              <Pressable
                onPress={handlePrimary}
                disabled={isFinishing}
                className="flex-1 py-4 rounded-2xl bg-primary-600 items-center ml-2 active:bg-primary-700"
                style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={primaryLabel}
              >
                {isFinishing ? (
                  <ActivityIndicator size="small" color={typo0} />
                ) : (
                  <Text className="text-typography-0 text-base font-body-semibold">{primaryLabel}</Text>
                )}
              </Pressable>
            </View>

            {!isLastStep && (
              <Pressable
                onPress={completeOnboarding}
                disabled={isFinishing}
                className="w-full py-2 rounded-2xl items-center"
                style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Skip for now"
              >
                <Text className="text-typography-500 text-sm font-body-medium">Skip for now</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/*  Preview mockup components                                         */
/* ------------------------------------------------------------------ */

function ContactsPreview({ primary600 }: { primary600: string }) {
  const contacts = [
    { initials: "PK", name: "Parinder Kumar", detail: "+91 98765 43210" },
    { initials: "SJ", name: "Sarah Johnson", detail: "Software Engineer · Google" },
    { initials: "AP", name: "Amit Patel", detail: "+91 87654 32109" },
    { initials: "LC", name: "Lisa Chen", detail: "Product Manager · Meta" },
    { initials: "RG", name: "Rahul Gupta", detail: "+91 76543 21098" },
  ];

  return (
    <View className="flex-1">
      {/* Search bar */}
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row items-center bg-background-50 rounded-2xl px-4 py-3 border border-border-200">
          <Search size={16} color={primary600} />
          <Text className="text-typography-400 text-sm ml-2">Search contacts</Text>
        </View>
      </View>

      {/* Contact list */}
      <View className="flex-1 px-4">
        {contacts.map((c) => (
          <View
            key={c.name}
            className="flex-row items-center py-3.5 border-b border-border-100"
          >
            <View className="w-11 h-11 rounded-2xl bg-primary-100 items-center justify-center mr-3">
              <Text className="text-primary-700 font-body-semibold text-sm">{c.initials}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-typography-900 font-body-semibold text-[15px]">{c.name}</Text>
              <Text className="text-typography-500 text-xs mt-0.5">{c.detail}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function AssistantPreview({
  primary600,
  typo0,
  typo400,
  typo500,
  today,
}: {
  primary600: string;
  typo0: string;
  typo400: string;
  typo500: string;
  today: string;
}) {
  return (
    <View className="flex-1 justify-between">
      {/* Chat messages */}
      <View className="flex-1 px-4 pt-4">
        {/* User message */}
        <View className="flex-row justify-end mb-3">
          <View className="bg-primary-600 rounded-2xl rounded-br-md px-4 py-3" style={{ maxWidth: "82%" }}>
            <Text className="text-typography-0 text-sm leading-5">
              I just spoke with Parinder, my neighbour. He has a boy in 3rd standard and a girl in 8th, both studying at Vidyaniketan.
            </Text>
          </View>
        </View>

        {/* Assistant message */}
        <View className="flex-row items-start mb-3">
          <View className="w-8 h-8 rounded-full bg-primary-100 items-center justify-center mr-2 mt-0.5">
            <HuskyLogo size={18} color={primary600} />
          </View>
          <View style={{ maxWidth: "78%" }}>
            <View className="bg-background-50 border border-border-200 rounded-2xl rounded-bl-md px-4 py-3 mb-2">
              <Text className="text-typography-900 text-sm leading-5">
                Got it! I logged a conversation with Parinder and saved the details about his children.
              </Text>
            </View>

            {/* Conversation card */}
            <View className="bg-background-50 border border-border-100 rounded-2xl p-3">
              <View className="flex-row items-center mb-2">
                <View className="w-9 h-9 rounded-xl bg-primary-100 items-center justify-center mr-2.5">
                  <Phone size={14} color={primary600} />
                </View>
                <View className="flex-1">
                  <Text className="text-typography-900 font-body-semibold text-sm">Parinder Kumar</Text>
                  <Text className="text-typography-500 text-xs mt-0.5">Phone Call · {today}</Text>
                </View>
              </View>
              <Text className="text-typography-700 text-xs leading-4" numberOfLines={2}>
                Neighbour, has a boy (3rd standard) and girl (8th) at Vidyaniketan School
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Input bar */}
      <View className="px-3 pb-3 pt-2 border-t border-border-200">
        <View className="flex-row items-end rounded-3xl border border-border-200 bg-background-50 px-3 py-2">
          <View className="flex-1 py-1.5 px-1">
            <Text className="text-typography-400 text-sm">Message Orbit...</Text>
          </View>
          <View className="w-9 h-9 rounded-xl bg-border-200 items-center justify-center ml-1.5">
            <Mic size={16} color={typo500} />
          </View>
          <View className="w-9 h-9 rounded-xl bg-border-200 items-center justify-center ml-1.5">
            <Send size={14} color={typo400} />
          </View>
        </View>
      </View>
    </View>
  );
}

function RemindersPreview({
  primary600,
  typo500,
  today,
}: {
  primary600: string;
  typo500: string;
  today: string;
}) {
  const todayDate = new Date();
  const reminders = [
    {
      month: todayDate.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
      day: String(todayDate.getDate()),
      dow: todayDate.toLocaleDateString("en-US", { weekday: "short" }),
      title: "Call Parinder",
      due: `Due ${today} · Open`,
      participant: "Parinder Kumar",
      note: "Follow up on getting a reference at Google",
    },
    {
      month: todayDate.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
      day: String(todayDate.getDate() + 4),
      dow: new Date(todayDate.getTime() + 4 * 86400000).toLocaleDateString("en-US", { weekday: "short" }),
      title: "Coffee with Sarah",
      due: "Due in 4 days · Open",
      participant: "Sarah Johnson",
      note: "Discuss the new project timeline",
    },
    {
      month: todayDate.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
      day: String(todayDate.getDate() + 11),
      dow: new Date(todayDate.getTime() + 11 * 86400000).toLocaleDateString("en-US", { weekday: "short" }),
      title: "Review Amit's proposal",
      due: "Due in 11 days · Open",
      participant: "Amit Patel",
      note: "Read through and provide feedback on budget section",
    },
  ];

  return (
    <View className="flex-1">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-typography-500 text-xs">{reminders.length} reminders</Text>
      </View>

      {reminders.map((r) => (
        <View
          key={r.title}
          className="flex-row px-4 py-3.5 bg-background-0 border-b border-border-100"
        >
          {/* Date column */}
          <View className="w-14 items-center mr-3">
            <Text className="text-typography-500 text-[10px] uppercase">{r.month}</Text>
            <Text className="text-typography-900 text-xl font-body-bold">{r.day}</Text>
            <Text className="text-typography-400 text-[10px]">{r.dow}</Text>
          </View>

          {/* Content */}
          <View className="flex-1 border-l-2 border-primary-200 pl-3">
            <View className="flex-row items-center mb-1">
              <View className="w-7 h-7 rounded-xl bg-primary-100 items-center justify-center mr-2">
                <Bell size={12} color={primary600} />
              </View>
              <Text className="text-typography-900 font-body-semibold text-sm flex-1" numberOfLines={1}>
                {r.title}
              </Text>
            </View>
            <Text className="text-typography-500 text-xs">{r.due}</Text>
            <Text className="text-typography-500 text-xs mt-0.5">{r.participant}</Text>
            <Text className="text-typography-700 text-xs mt-1 leading-4" numberOfLines={1}>
              {r.note}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ContactDetailPreview({
  primary600,
  typo500,
  today,
}: {
  primary600: string;
  typo500: string;
  today: string;
}) {
  return (
    <View className="flex-1">
      {/* Contact header */}
      <View className="items-center pt-5 pb-4 border-b border-border-100">
        <View className="w-16 h-16 rounded-2xl bg-primary-100 items-center justify-center mb-3">
          <Text className="text-primary-700 text-xl font-body-bold">PK</Text>
        </View>
        <Text className="text-typography-900 text-lg font-body-bold">Parinder Kumar</Text>
        <Text className="text-typography-500 text-sm mt-0.5">Neighbour</Text>
        <View className="flex-row mt-3">
          <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mx-2">
            <Phone size={16} color={primary600} />
          </View>
          <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mx-2">
            <MessageCircle size={16} color={primary600} />
          </View>
        </View>
      </View>

      {/* Conversations section */}
      <View className="px-4 pt-4">
        <Text className="text-typography-500 text-xs font-body-semibold uppercase mb-2">
          Conversations
        </Text>
        <View className="rounded-2xl border border-border-100 bg-background-50 p-3 mb-4">
          <View className="flex-row items-center mb-1.5">
            <View className="w-8 h-8 rounded-xl bg-primary-100 items-center justify-center mr-2">
              <Phone size={13} color={primary600} />
            </View>
            <View className="flex-1">
              <Text className="text-typography-900 font-body-semibold text-sm">Phone Call</Text>
              <Text className="text-typography-500 text-xs">{today}</Text>
            </View>
          </View>
          <Text className="text-typography-700 text-xs leading-4" numberOfLines={2}>
            Neighbour, has a boy (3rd standard) and girl (8th) studying at Vidyaniketan School
          </Text>
        </View>

        {/* Reminders section */}
        <Text className="text-typography-500 text-xs font-body-semibold uppercase mb-2">
          Reminders
        </Text>
        <View className="rounded-2xl border border-border-100 bg-background-50 p-3">
          <View className="flex-row items-center mb-1.5">
            <View className="w-8 h-8 rounded-xl bg-primary-100 items-center justify-center mr-2">
              <Bell size={13} color={primary600} />
            </View>
            <View className="flex-1">
              <Text className="text-typography-900 font-body-semibold text-sm">Call Parinder</Text>
              <Text className="text-typography-500 text-xs">Due {today} · Open</Text>
            </View>
          </View>
          <Text className="text-typography-700 text-xs leading-4" numberOfLines={2}>
            Follow up on getting a reference at Google
          </Text>
        </View>
      </View>
    </View>
  );
}
