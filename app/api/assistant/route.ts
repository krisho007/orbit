import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

type Message = {
  role: "user" | "assistant"
  content: string
}

// Fuzzy match contact by name
async function findContactByName(userId: string, name: string) {
  const contacts = await prisma.contact.findMany({
    where: { userId },
    select: { id: true, displayName: true }
  })

  // Simple fuzzy matching - find best match
  const normalized = name.toLowerCase().trim()
  let bestMatch = null
  let bestScore = 0

  for (const contact of contacts) {
    const contactName = contact.displayName.toLowerCase()
    if (contactName === normalized) {
      return contact // Exact match
    }
    if (contactName.includes(normalized) || normalized.includes(contactName)) {
      const score = Math.max(
        contactName.length / normalized.length,
        normalized.length / contactName.length
      )
      if (score > bestScore) {
        bestScore = score
        bestMatch = contact
      }
    }
  }

  return bestScore > 0.5 ? bestMatch : null
}

// Map natural language to ConversationMedium
function mapMedium(text: string): string {
  const lower = text.toLowerCase()
  if (lower.includes('phone') || lower.includes('call') || lower.includes('called')) return 'PHONE_CALL'
  if (lower.includes('whatsapp') || lower.includes('wa')) return 'WHATSAPP'
  if (lower.includes('email') || lower.includes('mail')) return 'EMAIL'
  if (lower.includes('met') || lower.includes('bumped into') || lower.includes('ran into')) return 'CHANCE_ENCOUNTER'
  if (lower.includes('zoom') || lower.includes('teams') || lower.includes('online') || lower.includes('video')) return 'ONLINE_MEETING'
  if (lower.includes('in person') || lower.includes('in-person') || lower.includes('coffee') || lower.includes('lunch') || lower.includes('dinner')) return 'IN_PERSON_MEETING'
  return 'OTHER'
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { messages } = await req.json() as { messages: Message[] }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "No messages provided" }, { status: 400 })
    }

    // Define tools for OpenAI function calling
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "create_conversation",
          description: "Create a new conversation record with participants",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Title/summary of the conversation" },
              participantNames: {
                type: "array",
                items: { type: "string" },
                description: "Names of people in the conversation"
              },
              medium: { type: "string", description: "How the conversation happened (e.g., 'phone call', 'WhatsApp', 'email')" },
              content: { type: "string", description: "Notes about the conversation" },
              happenedAt: { type: "string", description: "When it happened in ISO date format" }
            },
            required: ["title", "participantNames", "medium"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "query_conversations",
          description: "Search and retrieve conversations",
          parameters: {
            type: "object",
            properties: {
              participantName: { type: "string", description: "Name of participant to filter by" },
              medium: { type: "string", description: "Medium to filter by" },
              limit: { type: "number", description: "Number of results to return", default: 10 }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_event",
          description: "Create a new event with participants",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Event title" },
              participantNames: {
                type: "array",
                items: { type: "string" },
                description: "Names of people attending"
              },
              startAt: { type: "string", description: "Start date/time in ISO format" },
              endAt: { type: "string", description: "End date/time in ISO format" },
              location: { type: "string", description: "Event location" },
              description: { type: "string", description: "Event description" }
            },
            required: ["title", "startAt"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "query_events",
          description: "Search and retrieve events",
          parameters: {
            type: "object",
            properties: {
              participantName: { type: "string", description: "Name of participant to filter by" },
              limit: { type: "number", description: "Number of results to return", default: 10 }
            }
          }
        }
      }
    ]

    // Call OpenAI with function calling
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant for Orbit, a personal CRM app. Help users manage their contacts, conversations, and events. 
When users describe interactions or meetings, extract the relevant information and use the appropriate functions.
Be conversational and friendly.`
        },
        ...messages
      ],
      tools,
      tool_choice: "auto"
    })

    const responseMessage = completion.choices[0].message
    const toolCalls = responseMessage.tool_calls

    // If no tool calls, return the assistant's message
    if (!toolCalls || toolCalls.length === 0) {
      return NextResponse.json({
        message: responseMessage.content,
        actions: []
      })
    }

    // Execute tool calls
    const actions = []
    for (const toolCall of toolCalls) {
      if (toolCall.type !== 'function') continue
      const functionName = toolCall.function.name
      const args = JSON.parse(toolCall.function.arguments)

      try {
        if (functionName === "create_conversation") {
          // Find participants
          const participantIds = []
          for (const name of args.participantNames || []) {
            const contact = await findContactByName(session.user.id, name)
            if (contact) {
              participantIds.push(contact.id)
            }
          }

          if (participantIds.length === 0) {
            actions.push({
              type: "error",
              message: `Could not find contacts named: ${args.participantNames.join(', ')}`
            })
            continue
          }

          const medium = mapMedium(args.medium || '')
          
          const conversation = await prisma.conversation.create({
            data: {
              title: args.title,
              content: args.content || null,
              medium: medium as any,
              happenedAt: args.happenedAt ? new Date(args.happenedAt) : new Date(),
              userId: session.user.id,
              participants: {
                create: participantIds.map(id => ({ contactId: id }))
              }
            },
            include: {
              participants: {
                include: { contact: true }
              }
            }
          })

          actions.push({
            type: "conversation_created",
            data: conversation
          })

        } else if (functionName === "query_conversations") {
          let where: any = { userId: session.user.id }
          
          if (args.participantName) {
            const contact = await findContactByName(session.user.id, args.participantName)
            if (contact) {
              where.participants = {
                some: { contactId: contact.id }
              }
            }
          }

          if (args.medium) {
            where.medium = mapMedium(args.medium)
          }

          const conversations = await prisma.conversation.findMany({
            where,
            include: {
              participants: {
                include: { contact: true }
              }
            },
            orderBy: { happenedAt: 'desc' },
            take: args.limit || 10
          })

          actions.push({
            type: "conversations_found",
            data: conversations
          })

        } else if (functionName === "create_event") {
          const participantIds = []
          if (args.participantNames) {
            for (const name of args.participantNames) {
              const contact = await findContactByName(session.user.id, name)
              if (contact) {
                participantIds.push(contact.id)
              }
            }
          }

          const event = await prisma.event.create({
            data: {
              title: args.title,
              description: args.description || null,
              eventType: 'MEETING',
              startAt: new Date(args.startAt),
              endAt: args.endAt ? new Date(args.endAt) : null,
              location: args.location || null,
              userId: session.user.id,
              participants: {
                create: participantIds.map(id => ({ contactId: id }))
              }
            },
            include: {
              participants: {
                include: { contact: true }
              }
            }
          })

          actions.push({
            type: "event_created",
            data: event
          })

        } else if (functionName === "query_events") {
          let where: any = { userId: session.user.id }
          
          if (args.participantName) {
            const contact = await findContactByName(session.user.id, args.participantName)
            if (contact) {
              where.participants = {
                some: { contactId: contact.id }
              }
            }
          }

          const events = await prisma.event.findMany({
            where,
            include: {
              participants: {
                include: { contact: true }
              }
            },
            orderBy: { startAt: 'desc' },
            take: args.limit || 10
          })

          actions.push({
            type: "events_found",
            data: events
          })
        }
      } catch (error) {
        console.error(`Error executing ${functionName}:`, error)
        actions.push({
          type: "error",
          message: `Failed to execute ${functionName}: ${error instanceof Error ? error.message : 'Unknown error'}`
        })
      }
    }

    return NextResponse.json({
      message: responseMessage.content || "I've processed your request.",
      actions
    })

  } catch (error) {
    console.error("Assistant API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

