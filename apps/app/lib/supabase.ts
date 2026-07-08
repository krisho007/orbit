import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const message =
    "Missing Supabase environment variables. " +
    "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY for this build profile.";
  console.error(message);
  console.error("EXPO_PUBLIC_SUPABASE_URL:", supabaseUrl ?? "(not set)");
  console.error(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY:",
    supabaseAnonKey ? "(set)" : "(not set)"
  );
  throw new Error(message);
}

const webStorage = {
  getItem: (key: string) => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem(key);
    }
    return null;
  },
  setItem: (key: string, value: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, value);
    }
  },
  removeItem: (key: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(key);
    }
  },
};

const storage = Platform.OS === "web" ? webStorage : AsyncStorage;

// Disable detectSessionInUrl - we'll handle the code exchange manually
// Use implicit flow for native (returns tokens directly in URL hash, no PKCE verifier needed)
// Use PKCE for web (more secure in browser environment)
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // Disable auto-detection to prevent race conditions
      flowType: Platform.OS === "web" ? "pkce" : "implicit",
    },
  }
);
