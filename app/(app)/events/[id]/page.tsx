import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { EventDetail } from "@/components/events/event-detail"

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params
  
  const event = await prisma.event.findUnique({
    where: { 
      id,
      userId: session!.user.id
    },
    include: {
      participants: {
        include: {
          contact: true
        }
      },
      conversations: {
        include: {
          participants: {
            include: {
              contact: true
            }
          }
        },
        orderBy: {
          happenedAt: 'desc'
        }
      }
    }
  })

  if (!event) {
    notFound()
  }

  return (
    <div className="p-4 md:p-8">
      <EventDetail event={event} />
    </div>
  )
}


