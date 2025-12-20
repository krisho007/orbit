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
 * Fetch a contact with all related data using optimized parallel queries
 * All queries run in parallel using Promise.all for maximum speed
 */
export async function getContactDetailOptimized(
  contactId: string,
  userId: string
): Promise<ContactDetailData | null> {
  // First check if contact exists and belongs to user
  const contactExists = await prisma.contact.findUnique({
    where: {
      id: contactId,
      userId: userId,
    },
    select: { id: true }
  })

  if (!contactExists) {
    return null
  }

  // Run ALL queries in parallel - this is the key optimization
  const [
    contact,
    tags,
    relationshipsFrom,
    relationshipsTo,
    conversationParticipants,
    eventParticipants
  ] = await Promise.all([
    // Query 1: Get main contact with images and social links
    prisma.contact.findUnique({
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
    }),

    // Query 2: Get tags with their details
    prisma.contactTag.findMany({
      where: { contactId },
      include: { tag: true }
    }),

    // Query 3: Get relationships FROM this contact
    prisma.relationship.findMany({
      where: { fromContactId: contactId },
      include: {
        toContact: {
          select: { id: true, displayName: true, gender: true }
        },
        type: true
      }
    }),

    // Query 4: Get relationships TO this contact
    prisma.relationship.findMany({
      where: { toContactId: contactId },
      include: {
        fromContact: {
          select: { id: true, displayName: true, gender: true }
        },
        type: true
      }
    }),

    // Query 5: Get recent conversations
    prisma.conversationParticipant.findMany({
      where: { contactId },
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
        conversation: { happenedAt: 'desc' }
      },
      take: 10
    }),

    // Query 6: Get recent events
    prisma.eventParticipant.findMany({
      where: { contactId },
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
        event: { startAt: 'desc' }
      },
      take: 10
    })
  ])

  if (!contact) {
    return null
  }

  // Combine all results
  return {
    ...contact,
    tags,
    relationshipsFrom: relationshipsFrom as ContactDetailData['relationshipsFrom'],
    relationshipsTo: relationshipsTo as ContactDetailData['relationshipsTo'],
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
 * Note: Seeding check removed for performance - relationship types should be seeded
 * during user onboarding or first settings page visit, not on every contact view
 */
export async function getRelationshipTypesWithReverse(userId: string): Promise<RelationshipTypeWithReverse[]> {
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

