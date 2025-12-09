"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { ConversationMedium } from "@prisma/client"

const conversationSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().optional(),
  medium: z.nativeEnum(ConversationMedium),
  happenedAt: z.string().min(1, "Date is required"),
  followUpAt: z.string().optional(),
  eventId: z.string().optional(),
  participantIds: z.array(z.string()).min(1, "At least one participant is required"),
})

export async function createConversation(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  const participantIds = formData.getAll("participantIds") as string[]

  const data = {
    title: formData.get("title") as string,
    content: formData.get("content") as string || undefined,
    medium: formData.get("medium") as ConversationMedium,
    happenedAt: formData.get("happenedAt") as string,
    followUpAt: formData.get("followUpAt") as string || undefined,
    eventId: formData.get("eventId") as string || undefined,
    participantIds,
  }

  const validated = conversationSchema.parse(data)

  // Verify all participants belong to user
  const contacts = await prisma.contact.findMany({
    where: {
      id: { in: validated.participantIds },
      userId: session.user.id
    },
    select: { id: true }
  })

  if (contacts.length !== validated.participantIds.length) {
    throw new Error("Invalid participants")
  }

  const conversation = await prisma.conversation.create({
    data: {
      title: validated.title,
      content: validated.content,
      medium: validated.medium,
      happenedAt: new Date(validated.happenedAt),
      followUpAt: validated.followUpAt ? new Date(validated.followUpAt) : null,
      eventId: validated.eventId || null,
      userId: session.user.id,
      participants: {
        create: validated.participantIds.map(contactId => ({
          contactId
        }))
      }
    },
  })

  revalidatePath("/conversations")
  redirect(`/conversations/${conversation.id}`)
}

export async function updateConversation(conversationId: string, formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Verify ownership
  const existing = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true }
  })
  
  if (!existing || existing.userId !== session.user.id) {
    throw new Error("Conversation not found")
  }

  const participantIds = formData.getAll("participantIds") as string[]

  const data = {
    title: formData.get("title") as string,
    content: formData.get("content") as string || undefined,
    medium: formData.get("medium") as ConversationMedium,
    happenedAt: formData.get("happenedAt") as string,
    followUpAt: formData.get("followUpAt") as string || undefined,
    eventId: formData.get("eventId") as string || undefined,
    participantIds,
  }

  const validated = conversationSchema.parse(data)

  // Verify all participants belong to user
  const contacts = await prisma.contact.findMany({
    where: {
      id: { in: validated.participantIds },
      userId: session.user.id
    },
    select: { id: true }
  })

  if (contacts.length !== validated.participantIds.length) {
    throw new Error("Invalid participants")
  }

  // Delete existing participants and create new ones
  await prisma.conversationParticipant.deleteMany({
    where: { conversationId }
  })

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      title: validated.title,
      content: validated.content,
      medium: validated.medium,
      happenedAt: new Date(validated.happenedAt),
      followUpAt: validated.followUpAt ? new Date(validated.followUpAt) : null,
      eventId: validated.eventId || null,
      participants: {
        create: validated.participantIds.map(contactId => ({
          contactId
        }))
      }
    },
  })

  revalidatePath("/conversations")
  revalidatePath(`/conversations/${conversationId}`)
  redirect(`/conversations/${conversationId}`)
}

export async function deleteConversation(conversationId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Verify ownership
  const existing = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true }
  })
  
  if (!existing || existing.userId !== session.user.id) {
    throw new Error("Conversation not found")
  }

  await prisma.conversation.delete({
    where: { id: conversationId },
  })

  revalidatePath("/conversations")
  redirect("/conversations")
}


