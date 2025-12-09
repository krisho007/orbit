import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { ConversationDetail } from "@/components/conversations/conversation-detail"

export default async function ConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params
  
  const conversation = await prisma.conversation.findUnique({
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
      event: true
    }
  })

  if (!conversation) {
    notFound()
  }

  return (
    <div className="p-4 md:p-8">
      <ConversationDetail conversation={conversation} />
    </div>
  )
}


