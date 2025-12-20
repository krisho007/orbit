import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"

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

    // Build where clause with optional search
    const whereClause: { userId: string; OR?: { displayName?: { contains: string; mode: "insensitive" }; company?: { contains: string; mode: "insensitive" }; primaryEmail?: { contains: string; mode: "insensitive" } }[] } = { userId: session.user.id }

    if (search) {
      whereClause.OR = [
        { displayName: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
        { primaryEmail: { contains: search, mode: "insensitive" } },
      ]
    }

    const contacts = await prisma.contact.findMany({
      where: whereClause,
      include: {
        tags: {
          include: {
            tag: true
          }
        },
        images: {
          where: { order: 0 },
          take: 1,
          orderBy: { order: 'asc' }
        },
        _count: {
          select: {
            conversationParticipants: true,
            eventParticipants: true
          }
        }
      },
      orderBy: { displayName: 'asc' },
      take: PAGE_SIZE + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    })

    // Check if there are more results
    let nextCursor: string | null = null
    if (contacts.length > PAGE_SIZE) {
      const nextItem = contacts.pop()
      nextCursor = nextItem!.id
    }

    // Get total count for stats (only on first load without cursor)
    let totalCount: number | null = null
    let totalConversations: number | null = null
    let totalEvents: number | null = null

    if (!cursor && !search) {
      const stats = await prisma.$transaction([
        prisma.contact.count({ where: { userId: session.user.id } }),
        prisma.conversationParticipant.count({
          where: { contact: { userId: session.user.id } }
        }),
        prisma.eventParticipant.count({
          where: { contact: { userId: session.user.id } }
        }),
      ])
      totalCount = stats[0]
      totalConversations = stats[1]
      totalEvents = stats[2]
    }

    return NextResponse.json({
      contacts,
      nextCursor,
      stats: !cursor && !search ? {
        totalCount,
        totalConversations,
        totalEvents,
      } : null,
    })
  } catch (error) {
    console.error("Error fetching contacts:", error)
    return NextResponse.json(
      { error: "An error occurred while fetching contacts" },
      { status: 500 }
    )
  }
}
