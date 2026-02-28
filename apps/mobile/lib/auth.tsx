import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { Platform, Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { userApi } from "./api";

// Required for expo-web-browser to handle redirect properly
WebBrowser.maybeCompleteAuthSession();

// Check if running in Expo Go
const isExpoGo = Constants.appOwnership === "expo";

// Get the correct redirect URL based on environment
const getRedirectUrl = () => {
  // For development builds and production, use the app scheme
  // IMPORTANT: Do not use preferLocalhost for OAuth - it breaks the redirect
  const redirectUrl = AuthSession.makeRedirectUri({
    scheme: "orbit",
    path: "auth/callback",
  });
  if (__DEV__) {
    console.log("[Auth] Generated redirect URL:", redirectUrl);
    console.log("[Auth] Running in Expo Go:", isExpoGo);
  }
  return redirectUrl;
};

// The redirect URL that will be used - computed once
const redirectTo = getRedirectUrl();
const googleContactsScope =
  "openid email profile https://www.googleapis.com/auth/contacts.readonly";

const GOOGLE_CONSENT_GRANTED_KEY = "@orbit/google-consent-granted";

async function getGooglePrompt(): Promise<"consent" | "select_account"> {
  try {
    const flag = await AsyncStorage.getItem(GOOGLE_CONSENT_GRANTED_KEY);
    return flag === "1" ? "select_account" : "consent";
  } catch {
    return "consent";
  }
}

async function markGoogleConsentGranted(): Promise<void> {
  try {
    await AsyncStorage.setItem(GOOGLE_CONSENT_GRANTED_KEY, "1");
  } catch (err) {
    console.error("[Auth] Failed to persist Google consent flag:", err);
  }
}

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

    const handleDeepLink = async (url: string) => {
      if (__DEV__) console.log("[Auth] Handling deep link:", url);
      else console.log("[Auth] Handling deep link");
      try {
        const parsedUrl = new URL(url);
        const code = parsedUrl.searchParams.get("code");
        
        if (code) {
          console.log("[Auth] Found code in deep link, exchanging...");
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            console.error("[Auth] Deep link code exchange failed:", error.message);
          } else {
            console.log("[Auth] Deep link code exchange successful");

            // Store Google tokens from deep link PKCE exchange
            const dlProviderToken = (data.session as any)?.provider_token as string | undefined;
            const dlProviderRefreshToken = (data.session as any)?.provider_refresh_token as string | undefined;
            if (dlProviderToken) {
              userApi
                .storeGoogleTokens({
                  providerToken: dlProviderToken,
                  ...(dlProviderRefreshToken ? { providerRefreshToken: dlProviderRefreshToken } : {}),
                })
                .catch((err) =>
                  console.error("[Auth] Failed to store Google tokens (deep link):", err)
                );
            }
          }
        }
      } catch (err) {
        console.error("[Auth] Error handling deep link:", err);
      }
    };

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
                console.log("[Auth] Code exchange successful");

                // Store Google tokens from web PKCE exchange
                const webProviderToken = (data.session as any)?.provider_token as string | undefined;
                const webProviderRefreshToken = (data.session as any)?.provider_refresh_token as string | undefined;
                if (webProviderToken) {
                  userApi
                    .storeGoogleTokens({
                      providerToken: webProviderToken,
                      ...(webProviderRefreshToken ? { providerRefreshToken: webProviderRefreshToken } : {}),
                    })
                    .catch((err) =>
                      console.error("[Auth] Failed to store Google tokens (web PKCE):", err)
                    );
                }
              }
            } else {
              console.log("[Auth] Code already processed, skipping exchange");
            }

            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } else {
          // On native, check if we were opened with a URL containing a code
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl) {
            await handleDeepLink(initialUrl);
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

    // Listen for deep links on native
    let linkingSubscription: { remove: () => void } | null = null;
    if (Platform.OS !== "web") {
      linkingSubscription = Linking.addEventListener("url", (event) => {
        handleDeepLink(event.url);
      });
    }

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (__DEV__) console.log("Auth state changed:", _event, session?.user?.email);
      else console.log("Auth state changed:", _event);
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);

      // Capture Google provider tokens on sign-in and store server-side
      if (_event === "SIGNED_IN" && session) {
        const providerToken = (session as any).provider_token as string | undefined;
        const providerRefreshToken = (session as any).provider_refresh_token as string | undefined;
        if (providerToken) {
          userApi
            .storeGoogleTokens({
              providerToken,
              ...(providerRefreshToken ? { providerRefreshToken } : {}),
            })
            .catch((err) =>
              console.error("[Auth] Failed to store Google tokens:", err)
            );
        }

        markGoogleConsentGranted();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      linkingSubscription?.remove();
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      const prompt = await getGooglePrompt();

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
            scopes: googleContactsScope,
            queryParams: {
              access_type: "offline",
              prompt,
            },
          },
        });

        if (error) throw error;
      } else {
        // For native (iOS/Android), use expo-web-browser
        // IMPORTANT: Expo Go does NOT support OAuth redirects!
        // You must use a development build for OAuth to work.
        
        if (isExpoGo) {
          Alert.alert(
            "Development Build Required",
            "OAuth sign-in doesn't work in Expo Go. Please run:\n\nnpx expo run:android\n\nto create a development build that supports Google Sign-In.",
            [{ text: "OK" }]
          );
          return;
        }
        
        if (__DEV__) console.log("[Auth] Native OAuth redirect URL:", redirectTo);
        
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: redirectTo,
            skipBrowserRedirect: true,
            scopes: googleContactsScope,
            queryParams: {
              access_type: "offline",
              prompt,
            },
          },
        });

        if (error) throw error;

        console.log("[Auth] Opening browser for OAuth...");
        if (__DEV__) console.log("[Auth] OAuth URL:", data.url);
        
        // Open the OAuth URL in an in-app browser
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectTo,
          {
            showInRecents: true,
          }
        );

        console.log("[Auth] Browser result:", result.type);
        if (__DEV__) console.log("[Auth] Browser result details:", JSON.stringify(result));

        if (result.type === "success") {
          const url = result.url;
          if (__DEV__) console.log("[Auth] Callback URL:", url);
          else console.log("[Auth] Callback URL received");
          
          // Parse the URL to extract tokens or code
          const parsedUrl = new URL(url);
          
          // Check for access_token (implicit flow) in hash fragment
          // The hash comes as part of the URL in format: scheme://path#access_token=...
          const hashParams = new URLSearchParams(url.split('#')[1] || '');
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          
          // Also check query params for code (PKCE flow)
          const code = parsedUrl.searchParams.get("code");
          
          console.log("[Auth] Has access_token:", !!accessToken);
          console.log("[Auth] Has code:", !!code);
          
          if (accessToken && refreshToken) {
            // Implicit flow - set session directly
            console.log("[Auth] Using implicit flow with tokens");

            // Extract Google provider tokens from the hash fragment
            const googleProviderToken = hashParams.get('provider_token');
            const googleProviderRefreshToken = hashParams.get('provider_refresh_token');

            const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (sessionError) {
              console.error("[Auth] Set session error:", sessionError.message);
              throw sessionError;
            }

            console.log("[Auth] OAuth successful (implicit flow)");

            // Store Google tokens server-side
            if (googleProviderToken) {
              userApi
                .storeGoogleTokens({
                  providerToken: googleProviderToken,
                  ...(googleProviderRefreshToken ? { providerRefreshToken: googleProviderRefreshToken } : {}),
                })
                .catch((err) =>
                  console.error("[Auth] Failed to store Google tokens (implicit):", err)
                );
            }
          } else if (code) {
            // PKCE flow - exchange code for session
            console.log("[Auth] Using PKCE flow with code");
            const { data: exchangeData, error: exchangeError } =
              await supabase.auth.exchangeCodeForSession(code);

            if (exchangeError) {
              console.error("[Auth] Exchange error:", exchangeError.message);
              throw exchangeError;
            }

            if (!exchangeData.session) {
              throw new Error("No session returned from OAuth exchange.");
            }

            console.log("[Auth] OAuth successful (PKCE flow)");

            // Store Google tokens from PKCE exchange response
            const pkceProviderToken = (exchangeData.session as any).provider_token as string | undefined;
            const pkceProviderRefreshToken = (exchangeData.session as any).provider_refresh_token as string | undefined;
            if (pkceProviderToken) {
              userApi
                .storeGoogleTokens({
                  providerToken: pkceProviderToken,
                  ...(pkceProviderRefreshToken ? { providerRefreshToken: pkceProviderRefreshToken } : {}),
                })
                .catch((err) =>
                  console.error("[Auth] Failed to store Google tokens (PKCE native):", err)
                );
            }
          } else {
            console.error("[Auth] No tokens or code found in callback URL");
            if (__DEV__) console.error("[Auth] URL was:", url);
            throw new Error("No authorization data in callback URL");
          }
        } else if (result.type === "cancel") {
          console.log("[Auth] User cancelled OAuth");
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
