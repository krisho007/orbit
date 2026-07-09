import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CircleCheck, Download, RefreshCw, TriangleAlert, Users } from "lucide-react-native";
import { contactsApi, GoogleImportContact } from "../lib/api";
import { useAuth } from "../lib/auth";
import { markAppOnboardingComplete, onboardingVersion } from "../lib/onboarding";
import { getThemeColor, useThemeColors } from "../lib/theme";
import { useOnboarding } from "./_layout";

type ImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
};

export default function GoogleImportScreen() {
  const params = useLocalSearchParams<{ entry?: string }>();
  const isOnboardingEntry = params.entry === "onboarding";

  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { markOnboardingComplete } = useOnboarding();

  const [includePhotos, setIncludePhotos] = useState(true);
  const [contacts, setContacts] = useState<GoogleImportContact[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isCompletingOnboarding, setIsCompletingOnboarding] = useState(false);

  const handleFetchContacts = async () => {
    setIsFetching(true);
    setError(null);
    setResult(null);
    setContacts([]);

    try {
      const response = await contactsApi.fetchGoogleContacts({
        includePhotos,
      });
      setContacts(response.contacts || []);
    } catch (err: any) {
      console.error("Failed to fetch Google contacts:", err);
      if (err?.message?.includes("GOOGLE_REAUTH_REQUIRED") || err?.message?.includes("sign in with Google")) {
        setError(
          "Your Google authorization has expired. Please sign out and sign in again with Google to re-authorize contacts access."
        );
      } else {
        setError("Failed to fetch contacts from Google.");
      }
    } finally {
      setIsFetching(false);
    }
  };

  const handleImport = async () => {
    if (contacts.length === 0) return;

    setIsImporting(true);
    setError(null);
    setResult(null);
    setProgress({ current: 0, total: contacts.length });

    // Smaller batches keep each request short and let the N/M counter advance
    // smoothly. With photos enabled a 200-contact batch is a large upload plus
    // 200 serial blob writes, which makes the counter sit at 0 long enough to
    // look stalled (and risks request timeouts).
    const batchSize = includePhotos ? 40 : 100;
    const totals: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: 0 };

    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);
      try {
        const batchResult = await contactsApi.importGoogleContactsBatch(batch);
        totals.imported += batchResult.imported;
        totals.updated += batchResult.updated;
        totals.skipped += batchResult.skipped;
        totals.errors += batchResult.errors;
      } catch (err) {
        console.error("Batch import failed:", err);
        totals.errors += batch.length;
      } finally {
        setProgress({
          current: Math.min(i + batch.length, contacts.length),
          total: contacts.length,
        });
      }
    }

    setResult(totals);
    setIsImporting(false);
  };

  const handleFinish = async () => {
    if (!isOnboardingEntry) {
      router.back();
      return;
    }

    if (!user?.id) {
      router.replace("/(tabs)/assistant");
      return;
    }

    setIsCompletingOnboarding(true);
    setError(null);
    try {
      await markAppOnboardingComplete(user.id, onboardingVersion);
      markOnboardingComplete();
      router.replace("/(tabs)/assistant");
    } catch (err) {
      console.error("Failed to complete onboarding:", err);
      setError("Failed to continue. Please try again.");
    } finally {
      setIsCompletingOnboarding(false);
    }
  };

  const handleSkip = async () => {
    if (!isOnboardingEntry) {
      router.back();
      return;
    }
    await handleFinish();
  };

  const handleBackToOnboarding = () => {
    if (!isOnboardingEntry) {
      router.back();
      return;
    }

    router.replace({
      pathname: "/welcome" as any,
      params: { step: "0" },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-background-50">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View className="mb-6">
          <Text className="text-typography-900 text-3xl font-heading-bold mb-2">
            Import Google Contacts
          </Text>
          <Text className="text-typography-600 text-base">
            {isOnboardingEntry
              ? "Import now, or return to onboarding and continue the tour."
              : "Bring your Google contacts into Orbit anytime."}
          </Text>
        </View>

        {error && (
          <View className="mb-4 p-4 rounded-xl border border-error-200 bg-background-error flex-row">
            <TriangleAlert size={18} color={getThemeColor(colors, "error-600")} />
            <Text className="text-error-700 ml-2 flex-1">{error}</Text>
          </View>
        )}

        <View className="mb-4 p-4 rounded-2xl border border-border-200 bg-background-0">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-1 mr-3">
              <Text className="text-typography-900 font-body-semibold text-base">Include photos</Text>
              <Text className="text-typography-500 text-sm">Downloads Google profile photos.</Text>
            </View>
            <Switch
              value={includePhotos}
              onValueChange={setIncludePhotos}
              disabled={isFetching || isImporting}
              trackColor={{
                false: getThemeColor(colors, "border-300"),
                true: getThemeColor(colors, "primary-500"),
              }}
            />
          </View>

          <View className="mb-4 p-3 rounded-xl bg-background-50 border border-border-100">
            <Text className="text-typography-600 text-sm">
              Existing contacts are enriched, never overwritten: empty fields are filled
              from Google and more complete values are preferred. Your photos and edits are
              kept. Matching uses phone first, then email or name.
            </Text>
          </View>

          <Pressable
            onPress={handleFetchContacts}
            disabled={isFetching || isImporting}
            className="py-3 rounded-xl bg-primary-600 items-center"
            style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
          >
            {isFetching ? (
              <ActivityIndicator size="small" color={getThemeColor(colors, "typography-0")} />
            ) : (
              <View className="flex-row items-center">
                <Download size={16} color={getThemeColor(colors, "typography-0")} />
                <Text className="text-typography-0 font-body-semibold ml-2">Fetch Contacts</Text>
              </View>
            )}
          </Pressable>
        </View>

        {contacts.length > 0 && (
          <View className="mb-4 p-4 rounded-2xl border border-border-200 bg-background-0">
            <View className="flex-row items-center mb-3">
              <Users size={18} color={getThemeColor(colors, "primary-600")} />
              <Text className="text-typography-900 font-body-semibold ml-2">
                {contacts.length} contacts ready to import
              </Text>
            </View>
            <View className="mb-4">
              {contacts.slice(0, 20).map((contact, index) => {
                const name = contact.displayName || "Unknown";
                const subtitle =
                  contact.primaryPhone || contact.primaryEmail || contact.company || undefined;
                return (
                  <View
                    key={`${contact.displayName ?? "contact"}-${index}`}
                    className="flex-row items-center py-2"
                  >
                    <View className="w-9 h-9 rounded-xl bg-primary-100 items-center justify-center mr-3">
                      <Text className="text-primary-700 font-body-semibold">
                        {name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text numberOfLines={1} className="text-typography-900 font-body-medium">
                        {name}
                      </Text>
                      {!!subtitle && (
                        <Text numberOfLines={1} className="text-typography-500 text-[13px] mt-0.5">
                          {subtitle}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
              {contacts.length > 20 && (
                <Text className="text-typography-500 text-sm mt-1">
                  + {contacts.length - 20} more
                </Text>
              )}
            </View>

            {isImporting && progress.total > 0 && (
              <View className="mb-3">
                <View className="h-1.5 rounded-full bg-background-100 overflow-hidden">
                  <View
                    className="h-full rounded-full bg-primary-500"
                    style={{
                      width: `${Math.round((progress.current / progress.total) * 100)}%`,
                    }}
                  />
                </View>
              </View>
            )}

            <Pressable
              onPress={handleImport}
              disabled={isImporting}
              className="py-3.5 rounded-xl bg-primary-600 items-center"
              style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
            >
              {isImporting ? (
                <View className="flex-row items-center">
                  <ActivityIndicator size="small" color={getThemeColor(colors, "typography-0")} />
                  <Text className="text-typography-0 font-body-semibold ml-2">
                    Importing {progress.current}/{progress.total}
                  </Text>
                </View>
              ) : (
                <View className="flex-row items-center">
                  <RefreshCw size={16} color={getThemeColor(colors, "typography-0")} />
                  <Text className="text-typography-0 font-body-semibold ml-2">
                    Import {contacts.length} contacts
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        )}

        {result && (
          <View className="mb-4 p-4 rounded-2xl border border-success-200 bg-success-50">
            <View className="flex-row items-center mb-2">
              <CircleCheck size={18} color={getThemeColor(colors, "success-600")} />
              <Text className="text-success-700 font-body-semibold ml-2">Import complete</Text>
            </View>
            <Text className="text-success-700">Imported: {result.imported}</Text>
            <Text className="text-success-700">Updated: {result.updated}</Text>
            <Text className="text-success-700">Skipped: {result.skipped}</Text>
            <Text className="text-success-700">Errors: {result.errors}</Text>
          </View>
        )}

        <View className="mt-2">
          <Pressable
            onPress={handleFinish}
            disabled={isCompletingOnboarding || isImporting || isFetching}
            className="py-4 rounded-2xl bg-background-0 border border-border-200 items-center mb-3"
            style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
          >
            {isCompletingOnboarding ? (
              <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
            ) : (
              <Text className="text-typography-800 font-body-semibold">
                {isOnboardingEntry ? "Continue to Orbit" : "Done"}
              </Text>
            )}
          </Pressable>

          {isOnboardingEntry ? (
            <>
              <Pressable
                onPress={handleBackToOnboarding}
                disabled={isCompletingOnboarding || isImporting || isFetching}
                className="py-4 rounded-2xl border border-border-200 bg-background-0 items-center mb-3"
                style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
              >
                <Text className="text-typography-700 font-body-medium">Back to onboarding</Text>
              </Pressable>
              <Pressable
                onPress={handleSkip}
                disabled={isCompletingOnboarding || isImporting || isFetching}
                className="py-4 rounded-2xl items-center"
                style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
              >
                <Text className="text-typography-500 font-body-medium">Skip onboarding</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={handleSkip}
              disabled={isCompletingOnboarding || isImporting || isFetching}
              className="py-4 rounded-2xl items-center"
              style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
            >
              <Text className="text-typography-500 font-body-medium">Cancel</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
