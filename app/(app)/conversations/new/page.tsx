import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { ConversationForm } from "@/components/conversations/conversation-form"

export default async function NewConversationPage() {
  const session = await auth()
  
  // Run queries in parallel for faster page load
  const [contacts, events] = await Promise.all([
    prisma.contact.findMany({
      where: { userId: session!.user.id },
      select: {
        id: true,
        displayName: true
      },
      orderBy: { displayName: 'asc' }
    }),
    prisma.event.findMany({
      where: { userId: session!.user.id },
      select: {
        id: true,
        title: true,
        startAt: true
      },
      orderBy: { startAt: 'desc' },
      take: 50
    })
  ])

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">New Conversation</h1>
        <div className="bg-white rounded-lg shadow p-6">
          <ConversationForm contacts={contacts} events={events} />
        </div>
      </div>
    </div>
  )
}


