/**
 * Phone number lookup for caller ID feature
 * Used by mobile app to look up contacts by incoming phone number
 */

import { prisma } from "@/lib/prisma"

/**
 * Result type for caller ID lookup
 */
export type CallerIdContact = {
  id: string
  displayName: string
  company: string | null
  imageUrl: string | null
}

/**
 * Extracts digits from a phone number string
 * Returns null if fewer than 4 digits (not a valid phone search)
 */
export function normalizePhoneForLookup(phone: string): string | null {
  const digitsOnly = phone.replace(/\D/g, "")
  // Need at least 4 digits for a meaningful phone lookup
  if (digitsOnly.length < 4) return null
  return digitsOnly
}

/**
 * Look up a contact by phone number for caller ID
 * Matches the last N digits of the phone number (handles different country code formats)
 *
 * @param userId - User ID for multi-tenancy
 * @param phoneNumber - Incoming phone number (any format)
 * @returns Contact info for caller ID overlay, or null if not found
 */
export async function lookupContactByPhone(
  userId: string,
  phoneNumber: string
): Promise<CallerIdContact | null> {
  const phoneDigits = normalizePhoneForLookup(phoneNumber)

  if (!phoneDigits) {
    return null
  }

  // Use the last 10 digits for matching (handles country codes)
  // Most phone numbers are 10 digits without country code
  const searchDigits =
    phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits

  try {
    // Search for contact where primaryPhone contains these digits
    // Using raw query for efficient digit extraction
    const results = await prisma.$queryRaw<
      Array<{
        id: string
        displayName: string
        company: string | null
        imageUrl: string | null
      }>
    >`
      SELECT
        c.id,
        c."displayName",
        c.company,
        ci."imageUrl"
      FROM contacts c
      LEFT JOIN contact_images ci ON ci."contactId" = c.id AND ci."order" = 0
      WHERE
        c."userId" = ${userId}
        AND c."primaryPhone" IS NOT NULL
        AND regexp_replace(c."primaryPhone", '[^0-9]', '', 'g') LIKE '%' || ${searchDigits}
      LIMIT 1
    `

    if (results.length === 0) {
      return null
    }

    return results[0]
  } catch (error) {
    console.error("Phone lookup error:", error)
    return null
  }
}

/**
 * Look up multiple contacts by phone numbers (batch lookup)
 * Useful for syncing caller ID data
 */
export async function lookupContactsByPhones(
  userId: string,
  phoneNumbers: string[]
): Promise<Map<string, CallerIdContact>> {
  const result = new Map<string, CallerIdContact>()

  // Process in parallel with a limit
  const lookupPromises = phoneNumbers.map(async (phone) => {
    const contact = await lookupContactByPhone(userId, phone)
    if (contact) {
      result.set(phone, contact)
    }
  })

  await Promise.all(lookupPromises)
  return result
}
