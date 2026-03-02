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

// Only load the native module on Android — it doesn't exist on other platforms
const ContactIntent =
  Platform.OS === "android"
    ? require("expo-modules-core").requireNativeModule("ContactIntent")
    : noop;

export function getContactFromIntent(): ContactIntentResult {
  return ContactIntent.getContactFromIntent();
}

export function clearIntent(): void {
  ContactIntent.clearIntent();
}
