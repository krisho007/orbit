"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const tagSchema = z.object({
  name: z.string().min(1, "Tag name is required"),
  color: z.string().optional(),
})

export async function createTag(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  const data = {
    name: formData.get("name") as string,
    color: formData.get("color") as string || "#3B82F6",
  }

  const validated = tagSchema.parse(data)

  // Check if tag name already exists for this user
  const existing = await prisma.tag.findUnique({
    where: {
      userId_name: {
        userId: session.user.id,
        name: validated.name
      }
    }
  })

  if (existing) {
    throw new Error("Tag with this name already exists")
  }

  await prisma.tag.create({
    data: {
      ...validated,
      userId: session.user.id,
    },
  })

  revalidatePath("/settings")
  revalidatePath("/contacts")
}

export async function updateTag(tagId: string, formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Verify ownership
  const existing = await prisma.tag.findUnique({
    where: { id: tagId },
    select: { userId: true }
  })
  
  if (!existing || existing.userId !== session.user.id) {
    throw new Error("Tag not found")
  }

  const data = {
    name: formData.get("name") as string,
    color: formData.get("color") as string || "#3B82F6",
  }

  const validated = tagSchema.parse(data)

  await prisma.tag.update({
    where: { id: tagId },
    data: validated,
  })

  revalidatePath("/settings")
  revalidatePath("/contacts")
}

export async function deleteTag(tagId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Verify ownership
  const existing = await prisma.tag.findUnique({
    where: { id: tagId },
    select: { userId: true }
  })
  
  if (!existing || existing.userId !== session.user.id) {
    throw new Error("Tag not found")
  }

  // Delete tag (cascade will remove ContactTag entries)
  await prisma.tag.delete({
    where: { id: tagId },
  })

  revalidatePath("/settings")
  revalidatePath("/contacts")
}

export async function getTags() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  return await prisma.tag.findMany({
    where: { userId: session.user.id },
    include: {
      _count: {
        select: { contacts: true }
      }
    },
    orderBy: { name: 'asc' }
  })
}


