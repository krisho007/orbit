import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { searchContactsFuzzy } from "@/lib/queries/fuzzy-search"
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

    // Use fuzzy search when search term is provided
    if (search) {
      const { contactIds, hasMore } = await searchContactsFuzzy(
        session.user.id,
        search,
        { limit: PAGE_SIZE }
      )

      if (contactIds.length === 0) {
        return NextResponse.json({
          contacts: [],
          nextCursor: null,
          stats: null,
        })
      }

      // Fetch full contact data for matched IDs
      const contacts = await prisma.contact.findMany({
        where: {
          id: { in: contactIds },
          userId: session.user.id
        },
        include: {
          tags: {
            include: { tag: true }
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
        }
      })

      // Sort by fuzzy search order (best matches first)
      const sortedContacts = contactIds.map(id =>
        contacts.find(c => c.id === id)
      ).filter(Boolean)

      return NextResponse.json({
        contacts: sortedContacts,
        nextCursor: hasMore ? sortedContacts[sortedContacts.length - 1]?.id : null,
        stats: null,
      })
    }

    // Non-search: regular paginated list
    const contacts = await prisma.contact.findMany({
      where: { userId: session.user.id },
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

    if (!cursor) {
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
      stats: !cursor ? {
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
