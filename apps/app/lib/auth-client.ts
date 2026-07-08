import { createAuthClient } from "better-auth/react";

// Web-only PWA. Better Auth runs on the API and is served same-origin in prod
// (EXPO_PUBLIC_API_URL === ""), so the session cookie rides along automatically.
// In local dev (`web:local`) the API is on a different port, hence the explicit
// base + credentials: "include".
//
// The base must be an absolute URL: at runtime we use the browser origin, but
// during Expo's static web export (Node, no `window`, EXPO_PUBLIC_API_URL empty)
// we need a valid absolute placeholder or createAuthClient throws. The real
// origin is resolved in the browser bundle at runtime.
const apiBase =
  process.env.EXPO_PUBLIC_API_URL ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost");

export const authClient = createAuthClient({
  baseURL: `${apiBase}/api/auth`,
  fetchOptions: { credentials: "include" },
});

export const { useSession, signIn, signOut } = authClient;
