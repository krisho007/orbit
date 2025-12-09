import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { ConversationForm } from "@/components/conversations/conversation-form"

export default async function EditConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params
  
  const conversation = await prisma.conversation.findUnique({
    where: { 
      id,
      userId: session!.user.id
    },
    include: {
      participants: {
        select: { contactId: true }
      }
    }
  })

  if (!conversation) {
    notFound()
  }

  const contacts = await prisma.contact.findMany({
    where: { userId: session!.user.id },
    select: {
      id: true,
      displayName: true
    },
    orderBy: { displayName: 'asc' }
  })

  const events = await prisma.event.findMany({
    where: { userId: session!.user.id },
    select: {
      id: true,
      title: true,
      startAt: true
    },
    orderBy: { startAt: 'desc' },
    take: 50
  })

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Edit Conversation</h1>
        <div className="bg-white rounded-lg shadow p-6">
          <ConversationForm contacts={contacts} events={events} conversation={conversation} />
        </div>
      </div>
    </div>
  )
}


