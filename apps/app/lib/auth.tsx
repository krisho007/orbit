import React, { createContext, useContext } from "react";
import { authClient } from "./auth-client";

// Web-only Better Auth (Google) provider. Replaces the previous Supabase flow.
//
// Sign-in is a same-origin redirect to the API's /api/auth/sign-in/social →
// Google → /api/auth/callback/google → back to the app. The API captures the
// Google provider tokens (Contacts scope) server-side and sets the session
// cookie; there is no client-side token handling anymore.

// Minimal user/session shapes exposed to the app. Kept compatible with the
// previous consumers (they read user.id / user.email / user.name).
type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
} | null;

type AuthSession = { id: string; userId: string } | null;

type AuthContextType = {
  user: AuthUser;
  session: AuthSession;
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
  const { data, isPending } = authClient.useSession();

  const signInWithGoogle = async () => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : undefined;
    // Contacts scope + offline access + consent prompt are configured on the
    // server (socialProviders.google), so the client only names the provider.
    await authClient.signIn.social({
      provider: "google",
      callbackURL: origin ? `${origin}/` : "/",
      errorCallbackURL: origin ? `${origin}/sign-in` : "/sign-in",
    });
  };

  const signOut = async () => {
    await authClient.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user: data?.user
          ? {
              id: data.user.id,
              email: data.user.email,
              name: data.user.name,
              image: data.user.image,
            }
          : null,
        session: data?.session
          ? { id: data.session.id, userId: data.session.userId }
          : null,
        isLoading: isPending,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
