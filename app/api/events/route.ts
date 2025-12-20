import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { EventType } from "@prisma/client"

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
    const eventType = searchParams.get("eventType") as EventType | null

    // Build where clause
    const whereClause: {
      userId: string
      eventType?: EventType
      OR?: Array<
        | { title: { contains: string; mode: "insensitive" } }
        | { description: { contains: string; mode: "insensitive" } }
        | { location: { contains: string; mode: "insensitive" } }
      >
    } = { userId: session.user.id }

    if (eventType) {
      whereClause.eventType = eventType
    }

    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
      ]
    }

    const events = await prisma.event.findMany({
      where: whereClause,
      include: {
        participants: {
          include: {
            contact: true
          }
        },
        _count: {
          select: {
            conversations: true
          }
        }
      },
      orderBy: { startAt: 'desc' },
      take: PAGE_SIZE + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    })

    // Check if there are more results
    let nextCursor: string | null = null
    if (events.length > PAGE_SIZE) {
      const nextItem = events.pop()
      nextCursor = nextItem!.id
    }

    // Get total count on first load
    let totalCount: number | null = null
    if (!cursor && !search && !eventType) {
      totalCount = await prisma.event.count({ where: { userId: session.user.id } })
    }

    return NextResponse.json({
      events,
      nextCursor,
      totalCount,
    })
  } catch (error) {
    console.error("Error fetching events:", error)
    return NextResponse.json(
      { error: "An error occurred while fetching events" },
      { status: 500 }
    )
  }
}
