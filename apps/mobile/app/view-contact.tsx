import { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  Platform,
  PermissionsAndroid,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { contactsApi } from "../lib/api";
import { getThemeColor, useThemeColors } from "../lib/theme";
import {
  getContactFromIntent,
  clearIntent,
} from "../modules/contact-intent";

type ViewState = "loading" | "not-found" | "error" | "permission-denied";

export default function ViewContactScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [state, setState] = useState<ViewState>("loading");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // Platform guard — this feature is Android-only
  useEffect(() => {
    if (Platform.OS !== "android") {
      router.replace("/(tabs)/index" as any);
    }
  }, [router]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    let cancelled = false;

    const resolveContact = async () => {
      // 1. Request READ_CONTACTS permission at runtime
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
          {
            title: "Contacts Access",
            message:
              "Orbit needs contacts access to look up this contact's details.",
            buttonPositive: "Allow",
            buttonNegative: "Deny",
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          if (!cancelled) setState("permission-denied");
          return;
        }
      } catch {
        if (!cancelled) setState("permission-denied");
        return;
      }

      // 2. Read contact data from the native intent
      try {
        const intentData = getContactFromIntent();

        if (!intentData.hasIntent) {
          if (!cancelled) setState("not-found");
          return;
        }

        const { phone, email, name } = intentData;
        if (!cancelled) {
          setContactName(name || "");
          setContactPhone(phone || "");
          setContactEmail(email || "");
        }

        clearIntent();

        // 3. Match strategy: phone → name → email

        // 3a. Phone match
        if (phone) {
          try {
            const result = await contactsApi.searchByPhone({ phone });
            if (cancelled) return;
            if (result.contact?.id) {
              router.replace(`/contact/${result.contact.id}` as any);
              return;
            }
          } catch {
            // fall through to name search
          }
        }

        // 3b. Name match
        if (name) {
          try {
            const result = await contactsApi.list({ search: name, limit: 5 });
            if (cancelled) return;
            const exactMatch = result.contacts.find(
              (c) => c.displayName.toLowerCase() === name.toLowerCase()
            );
            if (exactMatch) {
              router.replace(`/contact/${exactMatch.id}` as any);
              return;
            }
          } catch {
            // fall through to email search
          }
        }

        // 3c. Email match
        if (email) {
          try {
            const result = await contactsApi.list({ search: email, limit: 5 });
            if (cancelled) return;
            const emailMatch = result.contacts.find(
              (c) => c.primaryEmail?.toLowerCase() === email.toLowerCase()
            );
            if (emailMatch) {
              router.replace(`/contact/${emailMatch.id}` as any);
              return;
            }
          } catch {
            // no match found
          }
        }

        if (!cancelled) setState("not-found");
      } catch (error) {
        console.error("Failed to resolve contact from intent:", error);
        if (!cancelled) setState("error");
      }
    };

    resolveContact();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleCreateContact = () => {
    const prefill: Record<string, string> = {};
    if (contactName) prefill.displayName = contactName;
    if (contactPhone) prefill.primaryPhone = contactPhone;
    if (contactEmail) prefill.primaryEmail = contactEmail;
    router.replace(
      `/contact/new?prefill=${encodeURIComponent(JSON.stringify(prefill))}` as any
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      <View className="flex-1 items-center justify-center px-6">
        {state === "loading" && (
          <>
            <ActivityIndicator
              size="large"
              color={getThemeColor(colors, "primary-600")}
            />
            <Text className="text-typography-700 text-base mt-4 text-center">
              Looking up contact in Orbit...
            </Text>
          </>
        )}

        {state === "permission-denied" && (
          <>
            <Text className="text-typography-900 text-lg font-body-semibold text-center">
              Permission Required
            </Text>
            <Text className="text-typography-600 text-center mt-2">
              Orbit needs contacts access to look up this contact's details.
            </Text>
            <Pressable
              className="mt-6 px-5 py-3 rounded-xl bg-primary-600"
              onPress={() => router.replace("/(tabs)/index" as any)}
            >
              <Text className="text-typography-0 font-body-medium">
                Open Contacts
              </Text>
            </Pressable>
          </>
        )}

        {state === "not-found" && (
          <>
            <Text className="text-typography-900 text-lg font-body-semibold text-center">
              Contact not found
            </Text>
            <Text className="text-typography-600 text-center mt-2">
              {contactName
                ? `"${contactName}" was not found in Orbit.`
                : "This contact was not found in Orbit."}
            </Text>
            <View className="mt-6 gap-3">
              <Pressable
                className="px-5 py-3 rounded-xl bg-primary-600"
                onPress={handleCreateContact}
              >
                <Text className="text-typography-0 font-body-medium text-center">
                  Create Contact
                </Text>
              </Pressable>
              <Pressable
                className="px-5 py-3 rounded-xl bg-background-100 border border-border-200"
                onPress={() => router.replace("/(tabs)/index" as any)}
              >
                <Text className="text-typography-700 font-body-medium text-center">
                  Open Contacts
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {state === "error" && (
          <>
            <Text className="text-typography-900 text-lg font-body-semibold text-center">
              Could not look up contact
            </Text>
            <Text className="text-typography-600 text-center mt-2">
              Orbit could not resolve this contact right now.
            </Text>
            <Pressable
              className="mt-6 px-5 py-3 rounded-xl bg-primary-600"
              onPress={() => router.replace("/(tabs)/index" as any)}
            >
              <Text className="text-typography-0 font-body-medium">
                Open Contacts
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
