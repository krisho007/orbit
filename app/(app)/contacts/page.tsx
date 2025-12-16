import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { ContactsList } from "@/components/contacts/contacts-list"

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
        where: { order: 0 }, // Only fetch the primary avatar image
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
    orderBy: { displayName: 'asc' }
  })

  return (
    <div className="p-4 md:p-8">
      <ContactsList contacts={contacts} />
    </div>
  )
}


