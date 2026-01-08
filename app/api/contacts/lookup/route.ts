import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

// Normalize phone number by removing all non-digit characters except leading +
function normalizePhone(phone: string): string {
  const hasPlus = phone.startsWith('+')
  const digits = phone.replace(/\D/g, '')
  return hasPlus ? `+${digits}` : digits
}

// Create search variants for flexible matching
function getPhoneVariants(phone: string): string[] {
  const normalized = normalizePhone(phone)
  const digits = normalized.replace(/\D/g, '')
  
  const variants = [
    phone, // original
    normalized, // normalized
    digits, // just digits
  ]
  
  // If has country code, also search without it
  if (digits.length > 10) {
    variants.push(digits.slice(-10)) // last 10 digits
  }
  
  // Add + prefix variant
  if (!normalized.startsWith('+')) {
    variants.push(`+${digits}`)
  }
  
  return [...new Set(variants)] // dedupe
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone')

  if (!phone) {
    return NextResponse.json({ error: 'Phone number required' }, { status: 400 })
  }

  const phoneVariants = getPhoneVariants(phone)
  
  // Search for contact with matching phone
  const contact = await prisma.contact.findFirst({
    where: {
      userId: session.user.id,
      OR: phoneVariants.map(variant => ({
        primaryPhone: {
          contains: variant,
          mode: 'insensitive' as const
        }
      }))
    },
    include: {
      images: {
        orderBy: { order: 'asc' },
        take: 1
      },
      tags: {
        include: { tag: true }
      },
      socialLinks: true,
      conversationParticipants: {
        include: {
          conversation: {
            select: {
              id: true,
              happenedAt: true,
              medium: true,
              content: true
            }
          }
        },
        orderBy: {
          conversation: { happenedAt: 'desc' }
        },
        take: 20
      },
      eventParticipants: {
        include: {
          event: {
            select: {
              id: true,
              title: true,
              startAt: true,
              eventType: true,
              location: true
            }
          }
        },
        orderBy: {
          event: { startAt: 'desc' }
        },
        take: 20
      },
      relationshipsFrom: {
        include: {
          type: true,
          toContact: {
            select: { id: true, displayName: true }
          }
        }
      }
    }
  })

  if (!contact) {
    return NextResponse.json({ contact: null })
  }

  return NextResponse.json({ contact })
}
