import { useMemo, useState } from "react";
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
  const { user, session } = useAuth();
  const { markOnboardingComplete } = useOnboarding();

  const accessToken = useMemo(
    () => ((session as unknown as { provider_token?: string } | null)?.provider_token ?? null),
    [session]
  );

  const [includePhotos, setIncludePhotos] = useState(true);
  const [overrideExisting, setOverrideExisting] = useState(false);
  const [contacts, setContacts] = useState<GoogleImportContact[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isCompletingOnboarding, setIsCompletingOnboarding] = useState(false);

  const handleFetchContacts = async () => {
    if (!accessToken) {
      setError(
        "Google token is unavailable. Please sign out and sign in again to grant contacts access."
      );
      return;
    }

    setIsFetching(true);
    setError(null);
    setResult(null);
    setContacts([]);

    try {
      const response = await contactsApi.fetchGoogleContacts({
        accessToken,
        includePhotos,
      });
      setContacts(response.contacts || []);
    } catch (err) {
      console.error("Failed to fetch Google contacts:", err);
      setError("Failed to fetch contacts from Google.");
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

    const batchSize = 200;
    const totals: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: 0 };

    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);
      try {
        const batchResult = await contactsApi.importGoogleContactsBatch(
          batch,
          overrideExisting
        );
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

        {!accessToken && (
          <View className="mb-4 p-4 rounded-xl border border-warning-200 bg-warning-50">
            <Text className="text-warning-700 text-sm">
              We could not find a Google access token in your current session. Sign out and sign in
              again if fetching fails.
            </Text>
          </View>
        )}

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

          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-1 mr-3">
              <Text className="text-typography-900 font-body-semibold text-base">
                Override existing contacts
              </Text>
              <Text className="text-typography-500 text-sm">
                Updates fields for matched contacts. Matching uses phone first, then email/name when phone is missing.
              </Text>
            </View>
            <Switch
              value={overrideExisting}
              onValueChange={setOverrideExisting}
              disabled={isFetching || isImporting}
              trackColor={{
                false: getThemeColor(colors, "border-300"),
                true: getThemeColor(colors, "primary-500"),
              }}
            />
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
            <View className="max-h-56 mb-4">
              {contacts.slice(0, 20).map((contact, index) => (
                <View
                  key={`${contact.displayName ?? "contact"}-${index}`}
                  className="py-2 border-b border-border-100"
                >
                  <Text className="text-typography-800">
                    {contact.displayName || "Unknown"}
                  </Text>
                  {!!contact.primaryPhone && (
                    <Text className="text-typography-500 text-sm">{contact.primaryPhone}</Text>
                  )}
                </View>
              ))}
              {contacts.length > 20 && (
                <Text className="text-typography-500 text-sm mt-2">
                  Showing first 20 contacts
                </Text>
              )}
            </View>

            <Pressable
              onPress={handleImport}
              disabled={isImporting}
              className="py-3 rounded-xl bg-secondary-600 items-center"
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
                  <Text className="text-typography-0 font-body-semibold ml-2">Import All</Text>
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
