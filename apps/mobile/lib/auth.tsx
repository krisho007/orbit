import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "./supabase";

// Required for expo-web-browser
WebBrowser.maybeCompleteAuthSession();

type AuthContextType = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const initSession = async () => {
      try {
        // On web, manually handle PKCE code exchange since detectSessionInUrl is disabled
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const url = new URL(window.location.href);
          const code = url.searchParams.get("code");

          if (code) {
            // Check if we already processed this code
            const processedKey = `__pkce_processed_${code}__`;
            if (!sessionStorage.getItem(processedKey)) {
              sessionStorage.setItem(processedKey, "1");

              console.log("[Auth] Exchanging PKCE code...");
              const { data, error } = await supabase.auth.exchangeCodeForSession(code);

              if (error) {
                console.error("[Auth] Code exchange failed:", error.message);
              } else {
                console.log("[Auth] Code exchange successful:", data.session?.user?.email);
              }
            } else {
              console.log("[Auth] Code already processed, skipping exchange");
            }

            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }

        // Get the current session
        const { data: { session } } = await supabase.auth.getSession();
        if (isMounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("[Auth] Init error:", err);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("Auth state changed:", _event, session?.user?.email);
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      if (Platform.OS === "web") {
        // For web, use standard OAuth redirect flow
        const redirectTo =
          typeof window !== "undefined"
            ? `${window.location.origin}/`
            : undefined;

        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo,
            queryParams: {
              access_type: "offline",
              prompt: "consent",
            },
          },
        });

        if (error) throw error;
      } else {
        // For native (iOS/Android), use expo-web-browser
        const redirectUrl = Linking.createURL("/(auth)/callback");
        
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true,
            queryParams: {
              access_type: "offline",
              prompt: "consent",
            },
          },
        });

        if (error) throw error;

        // Open the OAuth URL in an in-app browser
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectUrl
        );

        if (result.type === "success") {
          const { data: exchangeData, error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(result.url);

          if (exchangeError) {
            throw exchangeError;
          }

          if (!exchangeData.session) {
            throw new Error("No session returned from OAuth exchange.");
          }
        }
      }
    } catch (error) {
      console.error("Error signing in with Google:", error);
      throw error;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
