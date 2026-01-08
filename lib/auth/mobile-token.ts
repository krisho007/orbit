/**
 * Mobile token authentication utilities
 * Used by native mobile app (Capacitor) to authenticate API calls
 */

import { prisma } from "@/lib/prisma"
import { createHash, randomBytes } from "crypto"

/**
 * Generate a secure random token
 * Returns both the raw token (to give to user once) and hashed version (to store)
 */
export function generateToken(): { rawToken: string; hashedToken: string } {
  const rawToken = randomBytes(32).toString("base64url")
  const hashedToken = hashToken(rawToken)
  return { rawToken, hashedToken }
}

/**
 * Hash a token using SHA-256
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/**
 * Verify a mobile token from request headers
 * Returns the userId if valid, null otherwise
 */
export async function verifyMobileToken(
  request: Request
): Promise<{ success: true; userId: string } | { success: false; error: string }> {
  // Get token from Authorization header: "Bearer <token>"
  const authHeader = request.headers.get("Authorization")

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { success: false, error: "Missing or invalid Authorization header" }
  }

  const rawToken = authHeader.slice(7) // Remove "Bearer " prefix

  if (!rawToken) {
    return { success: false, error: "Empty token" }
  }

  const hashedToken = hashToken(rawToken)

  // Look up the token in the database
  const mobileToken = await prisma.mobileToken.findUnique({
    where: { token: hashedToken },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
    },
  })

  if (!mobileToken) {
    return { success: false, error: "Invalid token" }
  }

  // Check if token has expired
  if (mobileToken.expiresAt < new Date()) {
    return { success: false, error: "Token expired" }
  }

  // Update lastUsedAt (fire and forget - don't await)
  prisma.mobileToken.update({
    where: { id: mobileToken.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {
    // Ignore errors updating lastUsedAt
  })

  return { success: true, userId: mobileToken.userId }
}

/**
 * Create a new mobile token for a user
 */
export async function createMobileToken(
  userId: string,
  options: {
    deviceName?: string
    platform: "android" | "ios"
    expiresInDays?: number
  }
): Promise<{ rawToken: string; tokenId: string; expiresAt: Date }> {
  const { rawToken, hashedToken } = generateToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + (options.expiresInDays ?? 365))

  const mobileToken = await prisma.mobileToken.create({
    data: {
      userId,
      token: hashedToken,
      deviceName: options.deviceName,
      platform: options.platform,
      expiresAt,
    },
  })

  return {
    rawToken, // Return raw token only once - user must save it
    tokenId: mobileToken.id,
    expiresAt,
  }
}

/**
 * Revoke a mobile token
 */
export async function revokeMobileToken(
  tokenId: string,
  userId: string
): Promise<boolean> {
  const result = await prisma.mobileToken.deleteMany({
    where: {
      id: tokenId,
      userId, // Ensure user owns this token
    },
  })

  return result.count > 0
}

/**
 * List all mobile tokens for a user
 */
export async function listMobileTokens(userId: string) {
  return prisma.mobileToken.findMany({
    where: { userId },
    select: {
      id: true,
      deviceName: true,
      platform: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { lastUsedAt: "desc" },
  })
}
