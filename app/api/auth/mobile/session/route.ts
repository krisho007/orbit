/**
 * Mobile Session Exchange
 *
 * Exchanges a one-time auth code for a session.
 * This endpoint is called from the WebView after the mobile app
 * receives the deep link callback.
 *
 * Flow:
 * 1. Mobile app opens: /api/auth/mobile/session?code=xxx
 * 2. This endpoint validates the code
 * 3. Creates a session for the user
 * 4. Redirects to the app home page (now authenticated in WebView)
 */

import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")

  if (!code) {
    return NextResponse.redirect(
      new URL("/?error=missing_code", request.url)
    )
  }

  // Find and validate the code
  const authCode = await prisma.mobileAuthCode.findUnique({
    where: { code },
    include: { user: true },
  })

  if (!authCode) {
    return NextResponse.redirect(
      new URL("/?error=invalid_code", request.url)
    )
  }

  if (authCode.used) {
    return NextResponse.redirect(
      new URL("/?error=code_already_used", request.url)
    )
  }

  if (authCode.expiresAt < new Date()) {
    return NextResponse.redirect(
      new URL("/?error=code_expired", request.url)
    )
  }

  // Mark the code as used
  await prisma.mobileAuthCode.update({
    where: { id: authCode.id },
    data: { used: true },
  })

  // Create a new session for this user
  const sessionToken = randomBytes(32).toString("base64url")
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

  await prisma.session.create({
    data: {
      sessionToken,
      userId: authCode.userId,
      expires,
    },
  })

  // Set the session cookie
  const cookieStore = await cookies()

  // Auth.js uses different cookie names based on environment
  const cookieName = process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token"

  cookieStore.set(cookieName, sessionToken, {
    expires,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  })

  // Redirect to the contacts page (authenticated)
  return NextResponse.redirect(new URL("/contacts", request.url))
}
