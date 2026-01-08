import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { CallerId } from '@/components/call/caller-id'
import { FiPhone, FiUserX } from 'react-icons/fi'

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

interface PageProps {
  searchParams: Promise<{ phone?: string }>
}

export default async function CallPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/')
  }

  const params = await searchParams
  const phone = params.phone

  if (!phone) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col items-center justify-center p-8">
        <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center mb-6">
          <FiPhone className="h-10 w-10 text-gray-400" />
        </div>
        <h1 className="text-2xl font-bold mb-2">No Phone Number</h1>
        <p className="text-gray-400 text-center">
          Add a phone number to the URL to lookup a contact.
        </p>
        <p className="text-gray-500 text-sm mt-4 font-mono">
          /call?phone=+1234567890
        </p>
      </div>
    )
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
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col items-center justify-center p-8">
        <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center mb-6">
          <FiUserX className="h-10 w-10 text-gray-400" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Unknown Caller</h1>
        <p className="text-gray-400 text-center mb-2">
          No contact found for this number
        </p>
        <p className="text-white font-mono text-lg">{phone}</p>
      </div>
    )
  }

  return <CallerId contact={contact} phoneNumber={phone} />
}
