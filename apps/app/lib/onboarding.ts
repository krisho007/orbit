import AsyncStorage from "@react-native-async-storage/async-storage";

const GOOGLE_IMPORT_ONBOARDING_KEY_PREFIX = "@orbit/onboarding/google-import";
const APP_ONBOARDING_KEY_PREFIX = "@orbit/onboarding/app";
export const onboardingVersion = "v2";

function keyForUser(userId: string): string {
  return `${GOOGLE_IMPORT_ONBOARDING_KEY_PREFIX}:${userId}`;
}

function appOnboardingKeyForUser(userId: string, version: string): string {
  return `${APP_ONBOARDING_KEY_PREFIX}:${version}:${userId}`;
}

export async function isGoogleImportOnboardingComplete(userId: string): Promise<boolean> {
  const value = await AsyncStorage.getItem(keyForUser(userId));
  return value === "1";
}

export async function markGoogleImportOnboardingComplete(userId: string): Promise<void> {
  await AsyncStorage.setItem(keyForUser(userId), "1");
}

export async function isAppOnboardingComplete(
  userId: string,
  version: string = onboardingVersion
): Promise<boolean> {
  const [versionedComplete, legacyComplete] = await Promise.all([
    AsyncStorage.getItem(appOnboardingKeyForUser(userId, version)),
    AsyncStorage.getItem(keyForUser(userId)),
  ]);
  return versionedComplete === "1" || legacyComplete === "1";
}

export async function markAppOnboardingComplete(
  userId: string,
  version: string = onboardingVersion
): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(appOnboardingKeyForUser(userId, version), "1"),
    // Keep legacy key in sync so users are not re-blocked across releases.
    AsyncStorage.setItem(keyForUser(userId), "1"),
  ]);
}

export async function resetOnboardingForTesting(
  userId: string,
  version: string = onboardingVersion
): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(appOnboardingKeyForUser(userId, version)),
    AsyncStorage.removeItem(keyForUser(userId)),
  ]);
}
