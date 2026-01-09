/**
 * Mobile OAuth Initiation
 *
 * This endpoint initiates the Google OAuth flow for mobile apps.
 * It redirects to the Auth.js CSRF-protected signin endpoint.
 */

import { NextResponse } from "next/server"

export async function GET(request: Request) {
  let baseUrl = new URL(request.url).origin

  // For Android emulator development: 10.0.2.2 maps to host's localhost
  // But the OAuth browser runs on the host, so use localhost for callbacks
  if (baseUrl.includes("10.0.2.2")) {
    baseUrl = baseUrl.replace("10.0.2.2", "localhost")
  }

  // Redirect to the signin page with provider and callback
  // The signin page handles CSRF protection
  const callbackUrl = encodeURIComponent(`${baseUrl}/api/auth/mobile/callback`)
  const signinUrl = `${baseUrl}/api/auth/signin?callbackUrl=${callbackUrl}`

  return NextResponse.redirect(signinUrl)
}
