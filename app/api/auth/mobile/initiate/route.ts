/**
 * Mobile OAuth Initiation
 *
 * This endpoint initiates the Google OAuth flow for mobile apps.
 * It redirects to the Auth.js CSRF-protected signin endpoint.
 */

import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  let baseUrl = requestUrl.origin

  // For Android emulator development: 10.0.2.2 maps to host's localhost
  // But the OAuth browser runs on the host, so use localhost for callbacks
  if (baseUrl.includes("10.0.2.2")) {
    baseUrl = baseUrl.replace("10.0.2.2", "localhost")
  }

  const isMobile = requestUrl.searchParams.get("mobile") === "1"
  if (!isMobile) {
    const webCallbackUrl = encodeURIComponent(`${baseUrl}/contacts`)
    const signinUrl = `${baseUrl}/api/auth/signin?callbackUrl=${webCallbackUrl}`
    return NextResponse.redirect(signinUrl)
  }

  // Redirect to the signin page with provider and callback
  // The signin page handles CSRF protection
  const callbackUrl = encodeURIComponent(`${baseUrl}/api/auth/mobile/callback`)
  const signinUrl = `${baseUrl}/api/auth/signin?callbackUrl=${callbackUrl}`

  return NextResponse.redirect(signinUrl)
}
