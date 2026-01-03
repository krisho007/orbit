import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { findBestContactMatch, searchContactsFuzzy } from "@/lib/queries/fuzzy-search"
import {
  streamText,
  tool,
  convertToModelMessages,
  UIMessage,
  stepCountIs,
} from "ai"
import { google } from "@ai-sdk/google"
import { z } from "zod"

// Allow streaming responses up to 30 seconds
export const maxDuration = 30

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

// Parse comma-separated names into array
function parseNames(namesString: string): string[] {
  return namesString.split(',').map(n => n.trim()).filter(n => n.length > 0)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 401,
      headers: { "Content-Type": "application/json" }
    })
  }

  const { messages }: { messages: UIMessage[] } = await req.json()

  if (!messages || messages.length === 0) {
    return new Response(JSON.stringify({ error: "No messages provided" }), { 
      status: 400,
      headers: { "Content-Type": "application/json" }
    })
  }

  const userId = session.user.id

  // Define tools using AI SDK format
  // Using .optional() instead of .nullable() for Gemini compatibility
  const tools = {
    create_conversation: tool({
      description: "Create a new conversation record with participants",
      inputSchema: z.object({
        participantNames: z.string().describe("Comma-separated names of people in the conversation (e.g., 'John, Sarah')"),
        medium: z.string().describe("How the conversation happened (e.g., 'phone call', 'WhatsApp', 'email')"),
        content: z.string().optional().describe("Notes about the conversation"),
        happenedAt: z.string().optional().describe("When it happened in ISO date format")
      }),
      execute: async ({ participantNames, medium, content, happenedAt }) => {
        const names = parseNames(participantNames)
        const participantIds = []
        for (const name of names) {
          const contact = await findBestContactMatch(userId, name)
          if (contact) {
            participantIds.push(contact.id)
          }
        }

        if (participantIds.length === 0) {
          return {
            type: "error",
            message: `Could not find contacts named: ${participantNames}`
          }
        }

        const mappedMedium = mapMedium(medium || '')
        
        const conversation = await prisma.conversation.create({
          data: {
            content: content || null,
            medium: mappedMedium as any,
            happenedAt: happenedAt ? new Date(happenedAt) : new Date(),
            userId: userId,
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

        return {
          type: "conversation_created",
          id: conversation.id,
          medium: conversation.medium,
          happenedAt: conversation.happenedAt,
          participants: conversation.participants.map(p => p.contact.displayName)
        }
      }
    }),

    query_conversations: tool({
      description: "Search and retrieve conversations",
      inputSchema: z.object({
        participantName: z.string().optional().describe("Name of participant to filter by"),
        medium: z.string().optional().describe("Medium to filter by"),
        limit: z.number().optional().describe("Number of results to return, defaults to 10")
      }),
      execute: async ({ participantName, medium, limit }) => {
        const where: any = { userId: userId }
        
        if (participantName) {
          const contact = await findBestContactMatch(userId, participantName)
          if (contact) {
            where.participants = {
              some: { contactId: contact.id }
            }
          }
        }

        if (medium) {
          where.medium = mapMedium(medium)
        }

        const conversations = await prisma.conversation.findMany({
          where,
          include: {
            participants: {
              include: { contact: true }
            }
          },
          orderBy: { happenedAt: 'desc' },
          take: limit || 10
        })

        return {
          type: "conversations_found",
          count: conversations.length,
          conversations: conversations.map(c => ({
            id: c.id,
            medium: c.medium,
            happenedAt: c.happenedAt,
            content: c.content,
            participants: c.participants.map(p => p.contact.displayName)
          }))
        }
      }
    }),

    create_event: tool({
      description: "Create a new event with participants",
      inputSchema: z.object({
        title: z.string().describe("Event title"),
        participantNames: z.string().optional().describe("Comma-separated names of people attending (e.g., 'John, Sarah')"),
        startAt: z.string().describe("Start date/time in ISO format"),
        endAt: z.string().optional().describe("End date/time in ISO format"),
        location: z.string().optional().describe("Event location"),
        description: z.string().optional().describe("Event description")
      }),
      execute: async ({ title, participantNames, startAt, endAt, location, description }) => {
        const participantIds = []
        if (participantNames) {
          const names = parseNames(participantNames)
          for (const name of names) {
            const contact = await findBestContactMatch(userId, name)
            if (contact) {
              participantIds.push(contact.id)
            }
          }
        }

        const event = await prisma.event.create({
          data: {
            title,
            description: description || null,
            eventType: 'MEETING',
            startAt: new Date(startAt),
            endAt: endAt ? new Date(endAt) : null,
            location: location || null,
            userId: userId,
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

        return {
          type: "event_created",
          id: event.id,
          title: event.title,
          startAt: event.startAt,
          participants: event.participants.map(p => p.contact.displayName)
        }
      }
    }),

    query_events: tool({
      description: "Search and retrieve events",
      inputSchema: z.object({
        participantName: z.string().optional().describe("Name of participant to filter by"),
        limit: z.number().optional().describe("Number of results to return, defaults to 10")
      }),
      execute: async ({ participantName, limit }) => {
        const where: any = { userId: userId }
        
        if (participantName) {
          const contact = await findBestContactMatch(userId, participantName)
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
          take: limit || 10
        })

        return {
          type: "events_found",
          count: events.length,
          events: events.map(e => ({
            id: e.id,
            title: e.title,
            startAt: e.startAt,
            location: e.location,
            participants: e.participants.map(p => p.contact.displayName)
          }))
        }
      }
    }),

    create_contact: tool({
      description: "Create a new contact with their details",
      inputSchema: z.object({
        displayName: z.string().describe("The contact's full name"),
        primaryPhone: z.string().optional().describe("Phone number"),
        primaryEmail: z.string().optional().describe("Email address"),
        company: z.string().optional().describe("Company or organization"),
        jobTitle: z.string().optional().describe("Job title or role"),
        location: z.string().optional().describe("City, country, or address"),
        notes: z.string().optional().describe("Any notes about the contact")
      }),
      execute: async ({ displayName, primaryPhone, primaryEmail, company, jobTitle, location, notes }) => {
        const contact = await prisma.contact.create({
          data: {
            displayName,
            primaryPhone: primaryPhone || null,
            primaryEmail: primaryEmail || null,
            company: company || null,
            jobTitle: jobTitle || null,
            location: location || null,
            notes: notes || null,
            userId: userId
          }
        })

        return {
          type: "contact_created",
          id: contact.id,
          displayName: contact.displayName
        }
      }
    }),

    update_contact: tool({
      description: "Update an existing contact's information including phone number, email, etc.",
      inputSchema: z.object({
        contactName: z.string().describe("Name of the contact to update"),
        primaryPhone: z.string().optional().describe("New phone number"),
        primaryEmail: z.string().optional().describe("New email address"),
        company: z.string().optional().describe("New company or organization"),
        jobTitle: z.string().optional().describe("New job title or role"),
        location: z.string().optional().describe("New city, country, or address"),
        notes: z.string().optional().describe("New notes about the contact")
      }),
      execute: async ({ contactName, primaryPhone, primaryEmail, company, jobTitle, location, notes }) => {
        const contact = await findBestContactMatch(userId, contactName)
        
        if (!contact) {
          return {
            type: "error",
            message: `Could not find a contact named: ${contactName}`
          }
        }

        const updateData: any = {}
        if (primaryPhone !== undefined) updateData.primaryPhone = primaryPhone
        if (primaryEmail !== undefined) updateData.primaryEmail = primaryEmail
        if (company !== undefined) updateData.company = company
        if (jobTitle !== undefined) updateData.jobTitle = jobTitle
        if (location !== undefined) updateData.location = location
        if (notes !== undefined) updateData.notes = notes

        const updatedContact = await prisma.contact.update({
          where: { id: contact.id },
          data: updateData
        })

        return {
          type: "contact_updated",
          id: updatedContact.id,
          displayName: updatedContact.displayName
        }
      }
    }),

    query_contacts: tool({
      description: "Search and retrieve contacts by name, company, or other attributes using fuzzy matching",
      inputSchema: z.object({
        searchTerm: z.string().optional().describe("Name, company, or other term to search for"),
        limit: z.number().optional().describe("Number of results to return, defaults to 10")
      }),
      execute: async ({ searchTerm, limit }) => {
        const takeLimit = limit || 10

        if (searchTerm) {
          // Use fuzzy search for better matching
          const { contactIds } = await searchContactsFuzzy(userId, searchTerm, { limit: takeLimit })

          if (contactIds.length === 0) {
            return {
              type: "contacts_found",
              count: 0,
              contacts: []
            }
          }

          const contacts = await prisma.contact.findMany({
            where: {
              id: { in: contactIds },
              userId: userId
            },
            include: {
              tags: {
                include: { tag: true }
              }
            }
          })

          // Sort by fuzzy search order (best matches first)
          const sortedContacts = contactIds.map(id =>
            contacts.find(c => c.id === id)
          ).filter(Boolean)

          return {
            type: "contacts_found",
            count: sortedContacts.length,
            contacts: sortedContacts.map(c => ({
              id: c!.id,
              displayName: c!.displayName,
              company: c!.company,
              primaryEmail: c!.primaryEmail,
              primaryPhone: c!.primaryPhone
            }))
          }
        }

        // No search term - return all contacts
        const contacts = await prisma.contact.findMany({
          where: { userId: userId },
          include: {
            tags: {
              include: { tag: true }
            }
          },
          orderBy: { displayName: 'asc' },
          take: takeLimit
        })

        return {
          type: "contacts_found",
          count: contacts.length,
          contacts: contacts.map(c => ({
            id: c.id,
            displayName: c.displayName,
            company: c.company,
            primaryEmail: c.primaryEmail,
            primaryPhone: c.primaryPhone
          }))
        }
      }
    }),

    get_contact_details: tool({
      description: "Get full details of a specific contact including phone number, email, and all other information",
      inputSchema: z.object({
        contactName: z.string().describe("Name of the contact to look up")
      }),
      execute: async ({ contactName }) => {
        const contact = await findBestContactMatch(userId, contactName)
        
        if (!contact) {
          return {
            type: "error",
            message: `Could not find a contact named: ${contactName}`
          }
        }

        const fullContact = await prisma.contact.findUnique({
          where: { id: contact.id },
          include: {
            tags: {
              include: { tag: true }
            },
            socialLinks: true,
            images: true,
            relationshipsFrom: {
              include: {
                toContact: true,
                type: true
              }
            },
            relationshipsTo: {
              include: {
                fromContact: true,
                type: true
              }
            }
          }
        })

        return {
          type: "contact_details",
          id: fullContact?.id,
          displayName: fullContact?.displayName,
          primaryPhone: fullContact?.primaryPhone,
          primaryEmail: fullContact?.primaryEmail,
          company: fullContact?.company,
          jobTitle: fullContact?.jobTitle,
          location: fullContact?.location,
          notes: fullContact?.notes,
          dateOfBirth: fullContact?.dateOfBirth,
          tags: fullContact?.tags.map(t => t.tag.name),
          relationships: [
            ...(fullContact?.relationshipsFrom?.map(r => ({
              type: r.type.name,
              contact: r.toContact.displayName
            })) || []),
            ...(fullContact?.relationshipsTo?.map(r => ({
              type: r.type.name,
              contact: r.fromContact.displayName
            })) || [])
          ]
        }
      }
    })
  }

  const result = streamText({
    model: google("gemini-2.0-flash"),
    system: `You are a helpful assistant for Orbit, a personal CRM app. Help users manage their contacts, conversations, and events.

You can:
- Create new contacts with their name, phone number, email, company, job title, location, and notes
- Update existing contacts' information (phone numbers, emails, etc.)
- Look up contact details including phone numbers
- Search for contacts
- Log conversations with contacts
- Create and query events

When users describe interactions or meetings, extract the relevant information and use the appropriate functions.
When users ask about contact information like phone numbers, use the get_contact_details tool to retrieve it.
Be conversational and friendly.`,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5), // Allow multiple tool calls if needed
  })

  return result.toUIMessageStreamResponse()
}
