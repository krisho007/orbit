import { Platform } from "react-native";

type ContactIntentResult = {
  hasIntent: boolean;
  phone: string;
  email: string;
  name: string;
};

const noop = {
  getContactFromIntent: (): ContactIntentResult => ({
    hasIntent: false,
    phone: "",
    email: "",
    name: "",
  }),
  clearIntent: () => {},
};

// Only load the native module on Android dev builds — falls back to noop in Expo Go
let ContactIntent = noop;
if (Platform.OS === "android") {
  try {
    ContactIntent =
      require("expo-modules-core").requireNativeModule("ContactIntent");
  } catch {
    // Native module not available (e.g. running in Expo Go)
  }
}

export function getContactFromIntent(): ContactIntentResult {
  return ContactIntent.getContactFromIntent();
}

export function clearIntent(): void {
  ContactIntent.clearIntent();
}
