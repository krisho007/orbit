"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { EventType } from "@prisma/client"

const eventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  eventType: z.nativeEnum(EventType),
  startAt: z.string().min(1, "Start date is required"),
  endAt: z.string().optional(),
  location: z.string().optional(),
  participantIds: z.array(z.string()),
})

export async function createEvent(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  const participantIds = formData.getAll("participantIds") as string[]

  const data = {
    title: formData.get("title") as string,
    description: formData.get("description") as string || undefined,
    eventType: formData.get("eventType") as EventType,
    startAt: formData.get("startAt") as string,
    endAt: formData.get("endAt") as string || undefined,
    location: formData.get("location") as string || undefined,
    participantIds,
  }

  const validated = eventSchema.parse(data)

  // Verify all participants belong to user
  if (validated.participantIds.length > 0) {
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
  }

  const event = await prisma.event.create({
    data: {
      title: validated.title,
      description: validated.description,
      eventType: validated.eventType,
      startAt: new Date(validated.startAt),
      endAt: validated.endAt ? new Date(validated.endAt) : null,
      location: validated.location,
      userId: session.user.id,
      participants: {
        create: validated.participantIds.map(contactId => ({
          contactId
        }))
      }
    },
  })

  revalidatePath("/events")
  redirect(`/events/${event.id}`)
}

export async function updateEvent(eventId: string, formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Verify ownership
  const existing = await prisma.event.findUnique({
    where: { id: eventId },
    select: { userId: true }
  })
  
  if (!existing || existing.userId !== session.user.id) {
    throw new Error("Event not found")
  }

  const participantIds = formData.getAll("participantIds") as string[]

  const data = {
    title: formData.get("title") as string,
    description: formData.get("description") as string || undefined,
    eventType: formData.get("eventType") as EventType,
    startAt: formData.get("startAt") as string,
    endAt: formData.get("endAt") as string || undefined,
    location: formData.get("location") as string || undefined,
    participantIds,
  }

  const validated = eventSchema.parse(data)

  // Verify all participants belong to user
  if (validated.participantIds.length > 0) {
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
  }

  // Delete existing participants and create new ones
  await prisma.eventParticipant.deleteMany({
    where: { eventId }
  })

  await prisma.event.update({
    where: { id: eventId },
    data: {
      title: validated.title,
      description: validated.description,
      eventType: validated.eventType,
      startAt: new Date(validated.startAt),
      endAt: validated.endAt ? new Date(validated.endAt) : null,
      location: validated.location,
      participants: {
        create: validated.participantIds.map(contactId => ({
          contactId
        }))
      }
    },
  })

  revalidatePath("/events")
  revalidatePath(`/events/${eventId}`)
  redirect(`/events/${eventId}`)
}

export async function deleteEvent(eventId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Verify ownership
  const existing = await prisma.event.findUnique({
    where: { id: eventId },
    select: { userId: true }
  })
  
  if (!existing || existing.userId !== session.user.id) {
    throw new Error("Event not found")
  }

  await prisma.event.delete({
    where: { id: eventId },
  })

  revalidatePath("/events")
  redirect("/events")
}


