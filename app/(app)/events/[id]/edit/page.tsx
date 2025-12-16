import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { EventForm } from "@/components/events/event-form"

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params
  
  // Run queries in parallel for faster page load
  const [event, contacts] = await Promise.all([
    prisma.event.findUnique({
      where: { 
        id,
        userId: session!.user.id
      },
      include: {
        participants: {
          select: { contactId: true }
        }
      }
    }),
    prisma.contact.findMany({
      where: { userId: session!.user.id },
      select: {
        id: true,
        displayName: true
      },
      orderBy: { displayName: 'asc' }
    })
  ])

  if (!event) {
    notFound()
  }

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Edit Event</h1>
        <div className="bg-white rounded-lg shadow p-6">
          <EventForm contacts={contacts} event={event} />
        </div>
      </div>
    </div>
  )
}


