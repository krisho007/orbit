import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { ContactsList } from "@/components/contacts/contacts-list"

const PAGE_SIZE = 20

export default async function ContactsPage() {
  const session = await auth()

  const contacts = await prisma.contact.findMany({
    where: { userId: session!.user.id },
    include: {
      tags: {
        include: {
          tag: true
        }
      },
      images: {
        where: { order: 0 },
        take: 1,
        orderBy: { order: 'asc' }
      },
      _count: {
        select: {
          conversationParticipants: true,
          eventParticipants: true
        }
      }
    },
    orderBy: { displayName: 'asc' },
    take: PAGE_SIZE + 1,
  })

  // Check if there are more results
  let nextCursor: string | null = null
  if (contacts.length > PAGE_SIZE) {
    const nextItem = contacts.pop()
    nextCursor = nextItem!.id
  }

  // Get stats for the header
  const stats = await prisma.$transaction([
    prisma.contact.count({ where: { userId: session!.user.id } }),
    prisma.conversationParticipant.count({
      where: { contact: { userId: session!.user.id } }
    }),
    prisma.eventParticipant.count({
      where: { contact: { userId: session!.user.id } }
    }),
  ])

  return (
    <div className="p-4 md:p-8">
      <ContactsList
        initialContacts={contacts}
        initialCursor={nextCursor}
        stats={{
          totalCount: stats[0],
          totalConversations: stats[1],
          totalEvents: stats[2],
        }}
      />
    </div>
  )
}


