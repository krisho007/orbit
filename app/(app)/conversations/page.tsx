import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { ConversationsList } from "@/components/conversations/conversations-list"

const PAGE_SIZE = 20

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
    orderBy: { happenedAt: 'desc' },
    take: PAGE_SIZE + 1,
  })

  // Check if there are more results
  let nextCursor: string | null = null
  if (conversations.length > PAGE_SIZE) {
    const nextItem = conversations.pop()
    nextCursor = nextItem!.id
  }

  // Get total count
  const totalCount = await prisma.conversation.count({ where: { userId: session!.user.id } })

  return (
    <div className="p-4 md:p-8">
      <ConversationsList
        initialConversations={conversations}
        initialCursor={nextCursor}
        totalCount={totalCount}
      />
    </div>
  )
}
