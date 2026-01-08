/**
 * Mobile Token Management API
 *
 * POST - Generate a new mobile token (requires session auth)
 * GET - List user's mobile tokens (requires session auth)
 * DELETE - Revoke a mobile token (requires session auth)
 */

import { auth } from "@/auth"
import {
  createMobileToken,
  listMobileTokens,
  revokeMobileToken,
} from "@/lib/auth/mobile-token"
import { NextResponse } from "next/server"

/**
 * POST /api/mobile/auth/token
 * Generate a new mobile token
 *
 * Body: { deviceName?: string, platform: "android" | "ios" }
 * Returns: { token: string, tokenId: string, expiresAt: string }
 *
 * IMPORTANT: The token is only returned once. User must save it.
 */
export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { deviceName, platform } = body

    // Validate platform
    if (!platform || !["android", "ios"].includes(platform)) {
      return NextResponse.json(
        { error: "Invalid platform. Must be 'android' or 'ios'" },
        { status: 400 }
      )
    }

    const result = await createMobileToken(session.user.id, {
      deviceName: deviceName || undefined,
      platform,
    })

    return NextResponse.json({
      token: result.rawToken,
      tokenId: result.tokenId,
      expiresAt: result.expiresAt.toISOString(),
      message:
        "Save this token securely. It will not be shown again.",
    })
  } catch (error) {
    console.error("Error creating mobile token:", error)
    return NextResponse.json(
      { error: "Failed to create token" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/mobile/auth/token
 * List all mobile tokens for the current user
 */
export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const tokens = await listMobileTokens(session.user.id)

    return NextResponse.json({
      tokens: tokens.map((t) => ({
        id: t.id,
        deviceName: t.deviceName,
        platform: t.platform,
        lastUsedAt: t.lastUsedAt.toISOString(),
        expiresAt: t.expiresAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error("Error listing mobile tokens:", error)
    return NextResponse.json(
      { error: "Failed to list tokens" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/mobile/auth/token
 * Revoke a mobile token
 *
 * Body: { tokenId: string }
 */
export async function DELETE(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { tokenId } = body

    if (!tokenId) {
      return NextResponse.json(
        { error: "Missing tokenId" },
        { status: 400 }
      )
    }

    const revoked = await revokeMobileToken(tokenId, session.user.id)

    if (!revoked) {
      return NextResponse.json(
        { error: "Token not found or already revoked" },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error revoking mobile token:", error)
    return NextResponse.json(
      { error: "Failed to revoke token" },
      { status: 500 }
    )
  }
}
