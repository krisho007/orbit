import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { EventsList } from "@/components/events/events-list"

const PAGE_SIZE = 20

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
    orderBy: { startAt: 'desc' },
    take: PAGE_SIZE + 1,
  })

  // Check if there are more results
  let nextCursor: string | null = null
  if (events.length > PAGE_SIZE) {
    const nextItem = events.pop()
    nextCursor = nextItem!.id
  }

  // Get total count
  const totalCount = await prisma.event.count({ where: { userId: session!.user.id } })

  return (
    <div className="p-4 md:p-8">
      <EventsList
        initialEvents={events}
        initialCursor={nextCursor}
        totalCount={totalCount}
      />
    </div>
  )
}
