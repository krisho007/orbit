import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { ConversationsList } from "@/components/conversations/conversations-list"

export default async function ConversationsPage() {
  const session = await auth()
  
  const conversations = await prisma.conversation.findMany({
    where: { userId: session!.user.id },
    include: {
      participants: {
        include: {
          contact: true
        }
      },
      event: {
        select: {
          id: true,
          title: true
        }
      }
    },
    orderBy: { happenedAt: 'desc' }
  })

  return (
    <div className="p-4 md:p-8">
      <ConversationsList conversations={conversations} />
    </div>
  )
}
