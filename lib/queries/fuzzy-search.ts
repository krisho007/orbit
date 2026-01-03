/**
 * PostgreSQL trigram-based fuzzy search utilities
 * Uses pg_trgm extension for efficient similarity matching
 */

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

/**
 * Result type for fuzzy contact search - minimal fields for assistant
 */
export type FuzzyContactMatch = {
  id: string
  displayName: string
  similarity: number
}

/**
 * Default similarity threshold - 0.3 is lenient enough for partial matches
 * "Koundy" will match "Koundinya" with this threshold
 */
const DEFAULT_SIMILARITY_THRESHOLD = 0.3

/**
 * Find contacts by fuzzy name matching using PostgreSQL trigram similarity
 *
 * @param userId - User ID for multi-tenancy filtering
 * @param searchTerm - The name to search for
 * @param options - Optional configuration
 * @returns Array of matching contacts sorted by similarity (best first)
 *
 * @example
 * // Find contacts similar to "Koundy"
 * const matches = await findContactsFuzzy(userId, "Koundy")
 * // Returns: [{ id: "...", displayName: "Koundinya", similarity: 0.42 }]
 */
export async function findContactsFuzzy(
  userId: string,
  searchTerm: string,
  options: {
    threshold?: number
    limit?: number
  } = {}
): Promise<FuzzyContactMatch[]> {
  const {
    threshold = DEFAULT_SIMILARITY_THRESHOLD,
    limit = 10
  } = options

  // Normalize the search term
  const normalizedTerm = searchTerm.trim()

  if (!normalizedTerm) {
    return []
  }

  try {
    // Use GREATEST of similarity() and word_similarity() for better partial name matching
    // word_similarity() is better for "Keshava Ananda" matching "Keshav Anand"
    const results = await prisma.$queryRaw<FuzzyContactMatch[]>`
      SELECT
        id,
        "displayName",
        GREATEST(
          similarity("displayName", ${normalizedTerm}),
          word_similarity(${normalizedTerm}, "displayName")
        ) as similarity
      FROM contacts
      WHERE
        "userId" = ${userId}
        AND (
          similarity("displayName", ${normalizedTerm}) > ${threshold}
          OR word_similarity(${normalizedTerm}, "displayName") > ${threshold}
        )
      ORDER BY similarity DESC
      LIMIT ${limit}
    `

    return results
  } catch (error) {
    // Check if error is due to pg_trgm not being enabled
    if (error instanceof Error && error.message.includes('function similarity')) {
      console.error('pg_trgm extension not enabled. Falling back to ILIKE search.')
      return fallbackSearch(userId, normalizedTerm, limit)
    }
    throw error
  }
}

/**
 * Find the best matching contact by name
 * Returns the single best match above threshold, or null
 *
 * This is the primary function for the AI assistant's contact lookup
 */
export async function findBestContactMatch(
  userId: string,
  name: string,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): Promise<FuzzyContactMatch | null> {
  const matches = await findContactsFuzzy(userId, name, {
    threshold,
    limit: 1
  })

  return matches.length > 0 ? matches[0] : null
}

/**
 * Extended fuzzy search for UI - searches displayName and company
 * Returns contacts with their IDs sorted by similarity
 *
 * @param userId - User ID for multi-tenancy
 * @param searchTerm - Search term
 * @param options - Configuration options
 */
export async function searchContactsFuzzy(
  userId: string,
  searchTerm: string,
  options: {
    threshold?: number
    limit?: number
  } = {}
): Promise<{ contactIds: string[], hasMore: boolean }> {
  const {
    threshold = DEFAULT_SIMILARITY_THRESHOLD,
    limit = 20
  } = options

  const normalizedTerm = searchTerm.trim()

  if (!normalizedTerm) {
    return { contactIds: [], hasMore: false }
  }

  try {
    // Search both displayName and company using similarity + word_similarity
    // word_similarity handles partial word matches like "Keshava Ananda" -> "Keshav Anand"
    const results = await prisma.$queryRaw<{ id: string, similarity: number }[]>`
      SELECT
        id,
        GREATEST(
          similarity("displayName", ${normalizedTerm}),
          word_similarity(${normalizedTerm}, "displayName"),
          COALESCE(similarity(company, ${normalizedTerm}), 0),
          COALESCE(word_similarity(${normalizedTerm}, company), 0)
        ) as similarity
      FROM contacts
      WHERE
        "userId" = ${userId}
        AND (
          similarity("displayName", ${normalizedTerm}) > ${threshold}
          OR word_similarity(${normalizedTerm}, "displayName") > ${threshold}
          OR similarity(company, ${normalizedTerm}) > ${threshold}
          OR word_similarity(${normalizedTerm}, company) > ${threshold}
        )
      ORDER BY similarity DESC
      LIMIT ${limit + 1}
    `

    // Check if there are more results
    const hasMore = results.length > limit
    const contactIds = hasMore
      ? results.slice(0, -1).map(r => r.id)
      : results.map(r => r.id)

    return { contactIds, hasMore }
  } catch (error) {
    if (error instanceof Error && error.message.includes('function similarity')) {
      console.error('pg_trgm extension not enabled. Falling back to ILIKE search.')
      const fallbackResults = await fallbackSearch(userId, normalizedTerm, limit)
      return {
        contactIds: fallbackResults.map(r => r.id),
        hasMore: false
      }
    }
    throw error
  }
}

/**
 * Fallback search using ILIKE when pg_trgm is not available
 * This provides basic substring matching as a graceful degradation
 */
async function fallbackSearch(
  userId: string,
  searchTerm: string,
  limit: number
): Promise<FuzzyContactMatch[]> {
  const contacts = await prisma.contact.findMany({
    where: {
      userId,
      OR: [
        { displayName: { contains: searchTerm, mode: 'insensitive' } },
        { company: { contains: searchTerm, mode: 'insensitive' } },
      ]
    },
    select: {
      id: true,
      displayName: true
    },
    take: limit
  })

  // Return with fake similarity score for compatibility
  return contacts.map(c => ({
    ...c,
    similarity: 1.0
  }))
}

/**
 * Check if pg_trgm extension is available
 * Useful for health checks or initial setup verification
 */
export async function checkTrigramExtension(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT similarity('test', 'test')`
    return true
  } catch {
    return false
  }
}
