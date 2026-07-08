import { View, Text, Pressable, Alert, ScrollView, Switch, Linking, ActivityIndicator, Platform } from "react-native";
import { AnimatedTabScreen } from "../../components/animated-tab-screen";
import type { ComponentType } from "react";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../lib/auth";
import { useRouter } from "expo-router";
import {
  User,
  Tags,
  Download,
  Bell,
  Palette,
  HelpCircle,
  Shield,
  FileText,
  LogOut,
  ChevronRight,
  Trash2,
  Database,
  Brain,
  GitFork,
} from "lucide-react-native";
import { getThemeColor, useThemeColors, useThemeMode } from "../../lib/theme";
import { useGluestackUI } from "../../components/ui/gluestack-ui-provider";
import { HuskyLogo } from "../../components/HuskyLogo";
import { resetOnboardingForTesting } from "../../lib/onboarding";
import { useOnboarding } from "../_layout";
import { userApi, type PlanInfo } from "../../lib/api";
import { useConfirmDialog } from "../../components/confirm-dialog";

const PRIVACY_POLICY_URL = "https://orbitcrm.app/privacy";
const TERMS_URL = "https://orbitcrm.app/terms";

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { requireOnboarding } = useOnboarding();
  const colors = useThemeColors();
  const { setMode } = useThemeMode();
  const { resolvedColorMode } = useGluestackUI();
  const isDarkMode = resolvedColorMode === "dark";

  const [thirdPartyConsent, setThirdPartyConsent] = useState(false);
  const [consentLoading, setConsentLoading] = useState(true);
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const { confirm, ConfirmDialogElement } = useConfirmDialog();

  useEffect(() => {
    let cancelled = false;
    const loadConsent = async () => {
      try {
        const consent = await userApi.getConsent();
        if (!cancelled) {
          setThirdPartyConsent(consent.aiConsent && consent.sttConsent);
        }
      } catch (error) {
        console.error("Failed to load consent:", error);
      } finally {
        if (!cancelled) setConsentLoading(false);
      }
    };
    loadConsent();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadPlan = async () => {
      try {
        const data = await userApi.getPlan();
        if (!cancelled) setPlanInfo(data);
      } catch (error) {
        console.error("Failed to load plan:", error);
      }
    };
    loadPlan();
    return () => { cancelled = true; };
  }, []);

  const handleConsentToggle = useCallback(async (value: boolean) => {
    const prev = thirdPartyConsent;
    setThirdPartyConsent(value);
    try {
      await userApi.updateConsent({ aiConsent: value, sttConsent: value });
    } catch (error) {
      setThirdPartyConsent(prev);
      Alert.alert("Error", "Failed to update consent setting.");
    }
  }, [thirdPartyConsent]);

  const handleExportData = useCallback(async () => {
    setIsExporting(true);
    try {
      const data = await userApi.exportData();
      const json = JSON.stringify(data, null, 2);

      if (Platform.OS === "web") {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "orbit-data-export.json";
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const { Paths, File } = await import("expo-file-system");
        const Sharing = await import("expo-sharing");
        const file = new File(Paths.cache, "orbit-data-export.json");
        file.write(json);
        const canShare = await Sharing.default.isAvailableAsync();
        if (canShare) {
          await Sharing.default.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Export Orbit Data" });
        } else {
          Alert.alert("Exported", "Data saved but sharing is not available on this device.");
        }
      }
    } catch (error) {
      console.error("Export failed:", error);
      Alert.alert("Error", "Failed to export your data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    const confirmed = await confirm({
      title: "Delete Account",
      message: "This will permanently delete your account and all data. This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    setIsDeletingAccount(true);
    try {
      await userApi.deleteAccount();
      await signOut();
    } catch (error) {
      console.error("Account deletion failed:", error);
      Alert.alert("Error", "Failed to delete account. Please try again.");
      setIsDeletingAccount(false);
    }
  }, [signOut, confirm]);

  const handleSignOut = async () => {
    const confirmed = await confirm({
      title: "Sign Out",
      message: "Are you sure you want to sign out?",
      confirmLabel: "Sign Out",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await signOut();
    } catch (error) {
      Alert.alert("Error", "Failed to sign out. Please try again.");
    }
  };

  const handleResetOnboarding = async () => {
    if (!user?.id) {
      Alert.alert("Unavailable", "You need to be signed in to reset onboarding state.");
      return;
    }

    const confirmed = await confirm({
      title: "Reset Onboarding",
      message: "This will clear onboarding completion and assistant quick-start tip state for this account on this device.",
      confirmLabel: "Reset",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await resetOnboardingForTesting(user.id);
      requireOnboarding();
      router.replace("/welcome" as any);
    } catch (error) {
      console.error("Failed to reset onboarding state:", error);
      Alert.alert("Error", "Failed to reset onboarding state.");
    }
  };

  const SettingRow = ({
    icon: Icon,
    title,
    subtitle,
    onPress,
    danger = false,
    isLoading = false,
  }: {
    icon: ComponentType<{ size?: number; color?: string }>;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    danger?: boolean;
    isLoading?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress || isLoading}
      className="flex-row items-center p-4 bg-background-0 border-b border-border-100 active:bg-background-50"
    >
      <View
        className={`w-10 h-10 rounded-2xl items-center justify-center mr-4 ${
          danger ? "bg-error-50" : "bg-primary-100"
        }`}
      >
        <Icon
          size={18}
          color={
            danger
              ? getThemeColor(colors, "error-600")
              : getThemeColor(colors, "primary-600")
          }
        />
      </View>
      <View className="flex-1">
        <Text
          className={`text-base ${
            danger ? "text-error-600" : "text-typography-900"
          }`}
        >
          {title}
        </Text>
        {subtitle && <Text className="text-typography-500 text-sm">{subtitle}</Text>}
      </View>
      {isLoading ? (
        <ActivityIndicator size="small" color={getThemeColor(colors, "primary-500")} />
      ) : onPress ? (
        <ChevronRight size={16} color={getThemeColor(colors, "typography-400")} />
      ) : null}
    </Pressable>
  );

  return (
    <AnimatedTabScreen tabName="settings">
    <ScrollView className="flex-1 bg-background-50">
      <View className="bg-background-0 p-4 border-b border-border-100">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-typography-900 text-base font-body-semibold">
              Dark Mode
            </Text>
            <Text className="text-typography-500 text-sm">
              Default is system on first launch
            </Text>
          </View>
          <Switch
            value={isDarkMode}
            onValueChange={(value) => setMode(value ? "dark" : "light")}
            trackColor={{
              false: getThemeColor(colors, "border-300"),
              true: getThemeColor(colors, "primary-500"),
            }}
            thumbColor={
              isDarkMode
                ? getThemeColor(colors, "primary-700")
                : getThemeColor(colors, "background-0")
            }
            ios_backgroundColor={getThemeColor(colors, "border-300")}
          />
        </View>
      </View>
      <View className="bg-background-0 p-6 items-center border-b border-border-100">
        <View className="w-20 h-20 rounded-3xl bg-primary-100 items-center justify-center mb-4">
          <Text className="text-primary-700 text-3xl font-body-bold">
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </Text>
        </View>
        <Text className="text-typography-900 text-xl font-body-semibold">
          {user?.name || user?.email?.split("@")[0] || "User"}
        </Text>
        <Text className="text-typography-500">{user?.email}</Text>
      </View>

      {planInfo && (
        <View className="mt-6">
          <Text className="text-typography-500 text-sm font-body-medium px-4 pb-2 uppercase">
            Plan
          </Text>
          <View className="bg-background-0 p-4 border-b border-border-100">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-typography-900 text-base font-body-semibold">
                {planInfo.plan === "paid" ? "Pro" : "Free"}
              </Text>
              {planInfo.plan === "free" && (
                <Pressable
                  onPress={() => Linking.openURL("https://orbitcrm.app/upgrade")}
                  className="bg-primary-500 px-4 py-1.5 rounded-full"
                >
                  <Text className="text-white text-sm font-body-medium">Upgrade</Text>
                </Pressable>
              )}
            </View>

            {planInfo.limits.maxConversationsPerMonth !== null && (
              <View className="mb-3">
                <View className="flex-row justify-between mb-1">
                  <Text className="text-typography-500 text-sm">Conversations</Text>
                  <Text className="text-typography-500 text-sm">
                    {planInfo.usage.conversations}/{planInfo.limits.maxConversationsPerMonth}
                  </Text>
                </View>
                <View className="h-2 bg-background-100 rounded-full overflow-hidden">
                  <View
                    className={`h-full rounded-full ${
                      planInfo.usage.conversations / planInfo.limits.maxConversationsPerMonth > 0.8
                        ? "bg-warning-500"
                        : "bg-primary-500"
                    }`}
                    style={{
                      width: `${Math.min(100, (planInfo.usage.conversations / planInfo.limits.maxConversationsPerMonth) * 100)}%`,
                    }}
                  />
                </View>
              </View>
            )}

            {planInfo.limits.maxTokensPerMonth !== null && (
              <View>
                <View className="flex-row justify-between mb-1">
                  <Text className="text-typography-500 text-sm">Tokens</Text>
                  <Text className="text-typography-500 text-sm">
                    {planInfo.usage.totalTokens >= 1000
                      ? `${Math.round(planInfo.usage.totalTokens / 1000)}K`
                      : planInfo.usage.totalTokens}
                    /
                    {planInfo.limits.maxTokensPerMonth >= 1000
                      ? `${Math.round(planInfo.limits.maxTokensPerMonth / 1000)}K`
                      : planInfo.limits.maxTokensPerMonth}
                  </Text>
                </View>
                <View className="h-2 bg-background-100 rounded-full overflow-hidden">
                  <View
                    className={`h-full rounded-full ${
                      planInfo.usage.totalTokens / planInfo.limits.maxTokensPerMonth > 0.8
                        ? "bg-warning-500"
                        : "bg-primary-500"
                    }`}
                    style={{
                      width: `${Math.min(100, (planInfo.usage.totalTokens / planInfo.limits.maxTokensPerMonth) * 100)}%`,
                    }}
                  />
                </View>
              </View>
            )}

            <Text className="text-typography-400 text-xs mt-2">
              Resets monthly on the 1st
            </Text>
          </View>
        </View>
      )}

      <View className="mt-6">
        <Text className="text-typography-500 text-sm font-body-medium px-4 pb-2 uppercase">
          Account
        </Text>
        <SettingRow
          icon={User}
          title="Edit Profile"
          subtitle="Update your personal information"
          onPress={() =>
            Alert.alert("Coming Soon", "Profile settings will be available soon.")
          }
        />
        <SettingRow
          icon={Tags}
          title="Manage Tags"
          subtitle="Create and edit contact tags"
          onPress={() =>
            Alert.alert("Coming Soon", "Tag management will be available soon.")
          }
        />
        <SettingRow
          icon={GitFork}
          title="Relationship Types"
          subtitle="Define how contacts relate to each other"
          onPress={() => router.push("/relationship-types" as any)}
        />
        <SettingRow
          icon={Download}
          title="Import Google Contacts"
          subtitle="Fetch and merge contacts from your Google account"
          onPress={() =>
            router.push({
              pathname: "/google-import" as any,
              params: { entry: "settings" },
            })
          }
        />
      </View>

      <View className="mt-6">
        <Text className="text-typography-500 text-sm font-body-medium px-4 pb-2 uppercase">
          App
        </Text>
        <SettingRow
          icon={Bell}
          title="Notifications"
          subtitle="Manage notification preferences"
          onPress={() => {}}
        />
        <SettingRow
          icon={Palette}
          title="Appearance"
          subtitle="Theme and display settings"
          onPress={() => {}}
        />
        {__DEV__ && (
          <SettingRow
            icon={Bell}
            title="Reset Onboarding (Dev)"
            subtitle="Clear onboarding state and reopen the onboarding flow"
            onPress={handleResetOnboarding}
          />
        )}
      </View>

      <View className="mt-6">
        <Text className="text-typography-500 text-sm font-body-medium px-4 pb-2 uppercase">
          Data & Privacy
        </Text>
        <SettingRow
          icon={Download}
          title={isExporting ? "Exporting..." : "Export My Data"}
          subtitle="Download all your data as JSON"
          onPress={isExporting ? undefined : handleExportData}
          isLoading={isExporting}
        />
        <View className="flex-row items-center p-4 bg-background-0 border-b border-border-100">
          <View className="w-10 h-10 rounded-2xl items-center justify-center mr-4 bg-primary-100">
            <Brain size={18} color={getThemeColor(colors, "primary-600")} />
          </View>
          <View className="flex-1">
            <Text className="text-base text-typography-900">Third-Party AI Processing</Text>
            <Text className="text-typography-500 text-sm">Allow sending data to AI providers</Text>
          </View>
          {consentLoading ? (
            <ActivityIndicator size="small" color={getThemeColor(colors, "primary-500")} />
          ) : (
            <Switch
              value={thirdPartyConsent}
              onValueChange={handleConsentToggle}
              trackColor={{
                false: getThemeColor(colors, "border-300"),
                true: getThemeColor(colors, "primary-500"),
              }}
              thumbColor={thirdPartyConsent ? getThemeColor(colors, "primary-700") : getThemeColor(colors, "background-0")}
              ios_backgroundColor={getThemeColor(colors, "border-300")}
            />
          )}
        </View>
        <SettingRow
          icon={Database}
          title="Data & Third Parties"
          subtitle="What we collect and who processes it"
          onPress={() => router.push("/data-privacy" as any)}
        />
        <SettingRow
          icon={Shield}
          title="Privacy Policy"
          onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
        />
        <SettingRow
          icon={FileText}
          title="Terms of Service"
          onPress={() => Linking.openURL(TERMS_URL)}
        />
        <SettingRow
          icon={Trash2}
          title={isDeletingAccount ? "Deleting..." : "Delete Account"}
          subtitle="Permanently delete all your data"
          onPress={isDeletingAccount ? undefined : handleDeleteAccount}
          danger
        />
      </View>

      <View className="mt-6">
        <Text className="text-typography-500 text-sm font-body-medium px-4 pb-2 uppercase">
          Support
        </Text>
        <SettingRow icon={HelpCircle} title="Help & Support" onPress={() => {}} />
      </View>

      <View className="mt-6 mb-8">
        <SettingRow icon={LogOut} title="Sign Out" onPress={handleSignOut} danger />
      </View>

      <View className="items-center pb-8">
        <HuskyLogo size={40} color={getThemeColor(colors, "typography-300")} />
        <Text className="text-typography-900 text-base font-heading-bold mt-2">Orbit</Text>
        <Text className="text-typography-400 text-sm mt-0.5">v1.0.0</Text>
      </View>
    </ScrollView>

    {ConfirmDialogElement}
    </AnimatedTabScreen>
  );
}
