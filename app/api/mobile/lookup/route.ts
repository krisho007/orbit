/**
 * Phone Number Lookup API for Caller ID
 *
 * GET /api/mobile/lookup?phone=+14155551234
 *
 * Requires mobile token authentication (Bearer token in Authorization header)
 * Returns contact info for caller ID overlay
 */

import { verifyMobileToken } from "@/lib/auth/mobile-token"
import { lookupContactByPhone } from "@/lib/queries/phone-lookup"
import { NextResponse } from "next/server"

/**
 * GET /api/mobile/lookup?phone=<phone_number>
 *
 * Authorization: Bearer <mobile_token>
 *
 * Returns:
 * - { found: true, contact: { displayName, company, imageUrl } } if found
 * - { found: false } if not found
 */
export async function GET(request: Request) {
  // Verify mobile token
  const authResult = await verifyMobileToken(request)

  if (!authResult.success) {
    return NextResponse.json(
      { error: authResult.error },
      { status: 401 }
    )
  }

  // Get phone number from query params
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get("phone")

  if (!phone) {
    return NextResponse.json(
      { error: "Missing phone parameter" },
      { status: 400 }
    )
  }

  try {
    const contact = await lookupContactByPhone(authResult.userId, phone)

    if (!contact) {
      return NextResponse.json({ found: false })
    }

    return NextResponse.json({
      found: true,
      contact: {
        id: contact.id,
        displayName: contact.displayName,
        company: contact.company,
        imageUrl: contact.imageUrl,
      },
    })
  } catch (error) {
    console.error("Phone lookup error:", error)
    return NextResponse.json(
      { error: "Lookup failed" },
      { status: 500 }
    )
  }
}
