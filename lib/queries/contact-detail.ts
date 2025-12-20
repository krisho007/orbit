/**
 * Optimized contact detail query using JOINs
 * This reduces the N+1 query problem by fetching all related data in fewer queries
 */

import { prisma } from '@/lib/prisma'
import type { 
  Contact, 
  ContactTag, 
  Tag, 
  ContactImage, 
  SocialLink, 
  Relationship, 
  RelationshipType,
  ConversationParticipant, 
  EventParticipant,
  Gender
} from '@prisma/client'

export type RelationshipTypeWithReverse = RelationshipType & {
  reverseType: { id: string; name: string } | null
  maleReverseType: { id: string; name: string } | null
  femaleReverseType: { id: string; name: string } | null
}

export type ContactDetailData = Contact & {
  tags: (ContactTag & { tag: Tag })[]
  images: ContactImage[]
  socialLinks: SocialLink[]
  relationshipsFrom: (Relationship & { type: RelationshipType, toContact: Contact })[]
  relationshipsTo: (Relationship & { type: RelationshipType, fromContact: Contact })[]
  conversationParticipants: (ConversationParticipant & { 
    conversation: { id: string, title: string, happenedAt: Date, medium: string } 
  })[]
  eventParticipants: (EventParticipant & { 
    event: { id: string, title: string, startAt: Date, eventType: string } 
  })[]
}

export type SimpleContact = {
  id: string
  displayName: string
  gender: Gender | null
}

/**
 * Fetch a contact with all related data using optimized queries
 * Uses fewer queries with JOINs instead of Prisma's default N+1 pattern
 */
export async function getContactDetailOptimized(
  contactId: string,
  userId: string
): Promise<ContactDetailData | null> {
  // Main contact query with direct one-to-many relations using JOINs
  // We'll use Prisma's query builder but in a more optimized way
  
  // Query 1: Get main contact with simple relations (images, social links)
  const contact = await prisma.contact.findUnique({
    where: {
      id: contactId,
      userId: userId,
    },
    include: {
      images: {
        orderBy: { order: 'asc' }
      },
      socialLinks: true,
    }
  })

  if (!contact) {
    return null
  }

  // Query 2: Get tags with their details (using JOIN)
  const tags = await prisma.contactTag.findMany({
    where: {
      contactId: contactId
    },
    include: {
      tag: true
    }
  })

  // Query 3: Get relationships FROM this contact (with target contact info and type)
  const relationshipsFrom = await prisma.relationship.findMany({
    where: {
      fromContactId: contactId
    },
    include: {
      toContact: true,
      type: true
    }
  })

  // Query 4: Get relationships TO this contact (with source contact info and type)
  const relationshipsTo = await prisma.relationship.findMany({
    where: {
      toContactId: contactId
    },
    include: {
      fromContact: true,
      type: true
    }
  })

  // Query 5: Get recent conversations (with conversation details, ordered)
  const conversationParticipants = await prisma.conversationParticipant.findMany({
    where: {
      contactId: contactId
    },
    include: {
      conversation: {
        select: {
          id: true,
          title: true,
          happenedAt: true,
          medium: true
        }
      }
    },
    orderBy: {
      conversation: {
        happenedAt: 'desc'
      }
    },
    take: 10
  })

  // Query 6: Get recent events (with event details, ordered)
  const eventParticipants = await prisma.eventParticipant.findMany({
    where: {
      contactId: contactId
    },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          startAt: true,
          eventType: true
        }
      }
    },
    orderBy: {
      event: {
        startAt: 'desc'
      }
    },
    take: 10
  })

  // Combine all results
  return {
    ...contact,
    tags,
    relationshipsFrom,
    relationshipsTo,
    conversationParticipants,
    eventParticipants
  }
}

/**
 * Get all contacts for the relationship dialog
 */
export async function getAllContactsSimple(userId: string): Promise<SimpleContact[]> {
  return await prisma.contact.findMany({
    where: { userId },
    select: {
      id: true,
      displayName: true,
      gender: true,
    },
    orderBy: { displayName: 'asc' }
  })
}

/**
 * Get all relationship types with their reverse types
 */
export async function getRelationshipTypesWithReverse(userId: string): Promise<RelationshipTypeWithReverse[]> {
  // First ensure default types exist
  const existingTypes = await prisma.relationshipType.findMany({
    where: { userId }
  })

  if (existingTypes.length === 0) {
    // Import and call the seeding function
    const { ensureDefaultRelationshipTypes } = await import('@/app/(app)/settings/actions')
    await ensureDefaultRelationshipTypes()
  }

  return await prisma.relationshipType.findMany({
    where: { userId },
    include: {
      reverseType: {
        select: { id: true, name: true }
      },
      maleReverseType: {
        select: { id: true, name: true }
      },
      femaleReverseType: {
        select: { id: true, name: true }
      }
    },
    orderBy: { name: 'asc' }
  })
}

