import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { EventForm } from "@/components/events/event-form"

export default async function NewEventPage() {
  const session = await auth()
  
  const contacts = await prisma.contact.findMany({
    where: { userId: session!.user.id },
    select: {
      id: true,
      displayName: true
    },
    orderBy: { displayName: 'asc' }
  })

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">New Event</h1>
        <div className="bg-white rounded-lg shadow p-6">
          <EventForm contacts={contacts} />
        </div>
      </div>
    </div>
  )
}


