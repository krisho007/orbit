import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { ConversationMedium } from "@prisma/client"

const PAGE_SIZE = 20

export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const cursor = searchParams.get("cursor")
    const search = searchParams.get("search") || ""
    const medium = searchParams.get("medium") as ConversationMedium | null

    // Build where clause
    const whereClause: {
      userId: string
      medium?: ConversationMedium
      content?: { contains: string; mode: "insensitive" }
    } = { userId: session.user.id }

    if (medium) {
      whereClause.medium = medium
    }

    if (search) {
      whereClause.content = { contains: search, mode: "insensitive" }
    }

    const conversations = await prisma.conversation.findMany({
      where: whereClause,
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
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    })

    // Check if there are more results
    let nextCursor: string | null = null
    if (conversations.length > PAGE_SIZE) {
      const nextItem = conversations.pop()
      nextCursor = nextItem!.id
    }

    // Get total count on first load
    let totalCount: number | null = null
    if (!cursor && !search && !medium) {
      totalCount = await prisma.conversation.count({ where: { userId: session.user.id } })
    }

    return NextResponse.json({
      conversations,
      nextCursor,
      totalCount,
    })
  } catch (error) {
    console.error("Error fetching conversations:", error)
    return NextResponse.json(
      { error: "An error occurred while fetching conversations" },
      { status: 500 }
    )
  }
}
