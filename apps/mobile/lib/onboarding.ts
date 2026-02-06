import AsyncStorage from "@react-native-async-storage/async-storage";

const GOOGLE_IMPORT_ONBOARDING_KEY_PREFIX = "@orbit/onboarding/google-import";

function keyForUser(userId: string): string {
  return `${GOOGLE_IMPORT_ONBOARDING_KEY_PREFIX}:${userId}`;
}

export async function isGoogleImportOnboardingComplete(userId: string): Promise<boolean> {
  const value = await AsyncStorage.getItem(keyForUser(userId));
  return value === "1";
}

export async function markGoogleImportOnboardingComplete(userId: string): Promise<void> {
  await AsyncStorage.setItem(keyForUser(userId), "1");
}
