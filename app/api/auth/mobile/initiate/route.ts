/**
 * Mobile OAuth Initiation
 *
 * This endpoint initiates the Google OAuth flow for mobile apps.
 * It redirects to the Auth.js CSRF-protected signin endpoint.
 */

import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const baseUrl = new URL(request.url).origin

  // Redirect to the signin page with provider and callback
  // The signin page handles CSRF protection
  const callbackUrl = encodeURIComponent(`${baseUrl}/api/auth/mobile/callback`)
  const signinUrl = `${baseUrl}/api/auth/signin?callbackUrl=${callbackUrl}`

  return NextResponse.redirect(signinUrl)
}
