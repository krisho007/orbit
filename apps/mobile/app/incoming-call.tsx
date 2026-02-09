import { useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { contactsApi } from "../lib/api";
import { getThemeColor, useThemeColors } from "../lib/theme";

type ResolveState = "loading" | "not-found" | "error";

export default function IncomingCallScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { phone, phase } = useLocalSearchParams<{ phone?: string; phase?: string }>();
  const [state, setState] = useState<ResolveState>("loading");

  const incomingPhone = useMemo(() => {
    if (!phone) return "";
    return Array.isArray(phone) ? phone[0] : phone;
  }, [phone]);

  const callPhase = useMemo(() => {
    if (!phase) return "ringing";
    return Array.isArray(phase) ? phase[0] : phase;
  }, [phase]);

  useEffect(() => {
    let cancelled = false;

    const resolveContact = async () => {
      if (!incomingPhone) {
        if (!cancelled) setState("not-found");
        return;
      }

      try {
        const result = await contactsApi.searchByPhone({ phone: incomingPhone });
        if (cancelled) return;

        if (result.contact?.id) {
          if (callPhase === "ended") {
            router.replace(`/contact/${result.contact.id}/edit?focus=notes` as any);
          } else {
            router.replace(`/contact/${result.contact.id}` as any);
          }
          return;
        }

        setState("not-found");
      } catch (error) {
        console.error("Failed to resolve incoming caller:", error);
        if (!cancelled) setState("error");
      }
    };

    resolveContact();

    return () => {
      cancelled = true;
    };
  }, [callPhase, incomingPhone, router]);

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      <View className="flex-1 items-center justify-center px-6">
        {state === "loading" && (
          <>
            <ActivityIndicator size="large" color={getThemeColor(colors, "primary-600")} />
            <Text className="text-typography-700 text-base mt-4 text-center">
              Looking up caller in Orbit...
            </Text>
          </>
        )}

        {state === "not-found" && (
          <>
            <Text className="text-typography-900 text-lg font-semibold text-center">
              Caller not found
            </Text>
            <Text className="text-typography-600 text-center mt-2">
              {incomingPhone
                ? `No contact matched ${incomingPhone}.`
                : "No caller number was available."}
            </Text>
            <Pressable
              className="mt-6 px-5 py-3 rounded-xl bg-primary-600"
              onPress={() => router.replace("/(tabs)/index" as any)}
            >
              <Text className="text-typography-0 font-medium">Open Contacts</Text>
            </Pressable>
          </>
        )}

        {state === "error" && (
          <>
            <Text className="text-typography-900 text-lg font-semibold text-center">
              Could not open caller profile
            </Text>
            <Text className="text-typography-600 text-center mt-2">
              Orbit could not resolve the caller right now.
            </Text>
            <Pressable
              className="mt-6 px-5 py-3 rounded-xl bg-primary-600"
              onPress={() => router.replace("/(tabs)/index" as any)}
            >
              <Text className="text-typography-0 font-medium">Open Contacts</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
