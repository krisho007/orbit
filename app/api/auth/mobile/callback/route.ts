/**
 * Mobile OAuth Callback
 *
 * After successful Google OAuth, this endpoint:
 * 1. Verifies the user is authenticated
 * 2. Creates a one-time auth code
 * 3. Redirects to the mobile app via deep link
 *
 * The mobile app then exchanges the code for a session in the WebView
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { randomBytes } from "crypto"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    // Not authenticated - redirect to error
    return NextResponse.redirect(
      new URL("/?error=mobile_auth_failed", process.env.NEXTAUTH_URL || "https://orbit-xi-five.vercel.app")
    )
  }

  // Generate a secure one-time code
  const code = randomBytes(32).toString("base64url")

  // Store the code (expires in 5 minutes)
  await prisma.mobileAuthCode.create({
    data: {
      userId: session.user.id,
      code,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    },
  })

  // Clean up old unused codes for this user
  await prisma.mobileAuthCode.deleteMany({
    where: {
      userId: session.user.id,
      OR: [
        { expiresAt: { lt: new Date() } },
        { used: true },
      ],
    },
  }).catch(() => {
    // Ignore cleanup errors
  })

  // Redirect to mobile app with the code
  return NextResponse.redirect(`orbit://auth?code=${code}`)
}
