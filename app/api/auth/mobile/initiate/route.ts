/**
 * Mobile OAuth Initiation
 *
 * This endpoint initiates the Google OAuth flow for mobile apps.
 * It uses server-side signIn() to properly start the OAuth flow,
 * which then redirects to Google and back to our mobile callback.
 */

import { signIn } from "@/auth"

export async function GET() {
  // Initiate OAuth with the mobile callback as the redirect target
  // This properly starts the OAuth flow server-side
  return signIn("google", {
    redirectTo: "/api/auth/mobile/callback",
  })
}
