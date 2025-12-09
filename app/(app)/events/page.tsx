import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { EventsList } from "@/components/events/events-list"

export default async function EventsPage() {
  const session = await auth()
  
  const events = await prisma.event.findMany({
    where: { userId: session!.user.id },
    include: {
      participants: {
        include: {
          contact: true
        }
      },
      _count: {
        select: {
          conversations: true
        }
      }
    },
    orderBy: { startAt: 'desc' }
  })

  return (
    <div className="p-4 md:p-8">
      <EventsList events={events} />
    </div>
  )
}
