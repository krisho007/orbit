import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { ContactDetail } from "@/components/contacts/contact-detail"

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params
  
  const contact = await prisma.contact.findUnique({
    where: { 
      id,
      userId: session!.user.id // Multi-tenancy enforcement
    },
    include: {
      tags: {
        include: {
          tag: true
        }
      },
      images: {
        orderBy: { order: 'asc' }
      },
      socialLinks: true,
      relationshipsFrom: {
        include: {
          toContact: true
        }
      },
      relationshipsTo: {
        include: {
          fromContact: true
        }
      },
      conversationParticipants: {
        include: {
          conversation: true
        },
        orderBy: {
          conversation: {
            happenedAt: 'desc'
          }
        },
        take: 10
      },
      eventParticipants: {
        include: {
          event: true
        },
        orderBy: {
          event: {
            startAt: 'desc'
          }
        },
        take: 10
      }
    }
  })

  if (!contact) {
    notFound()
  }

  return (
    <div className="p-4 md:p-8">
      <ContactDetail contact={contact} />
    </div>
  )
}


