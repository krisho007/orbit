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

// ============================================
// Relationship Type Actions
// ============================================

const relationshipTypeSchema = z.object({
  name: z.string().min(1, "Relationship type name is required"),
  isSymmetric: z.boolean().default(false),
  reverseTypeId: z.string().optional(),
  maleReverseTypeId: z.string().optional(),
  femaleReverseTypeId: z.string().optional(),
})

// Default relationship types to seed for new users
const DEFAULT_RELATIONSHIP_TYPES = [
  // Symmetric relationships
  { name: 'Spouse', isSymmetric: true },
  { name: 'Sibling', isSymmetric: true },
  { name: 'Friend', isSymmetric: true },
  { name: 'Colleague', isSymmetric: true },
  // Asymmetric relationships (will be linked after creation)
  { name: 'Father', isSymmetric: false },
  { name: 'Mother', isSymmetric: false },
  { name: 'Son', isSymmetric: false },
  { name: 'Daughter', isSymmetric: false },
  { name: 'Manager', isSymmetric: false },
  { name: 'Direct Report', isSymmetric: false },
  { name: 'Mentor', isSymmetric: false },
  { name: 'Mentee', isSymmetric: false },
]

export async function ensureDefaultRelationshipTypes() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Check if user already has relationship types
  const existingTypes = await prisma.relationshipType.findMany({
    where: { userId: session.user.id }
  })

  if (existingTypes.length > 0) {
    return existingTypes
  }

  // Create default types
  const createdTypes: Record<string, string> = {}
  
  for (const typeData of DEFAULT_RELATIONSHIP_TYPES) {
    const created = await prisma.relationshipType.create({
      data: {
        name: typeData.name,
        isSymmetric: typeData.isSymmetric,
        isSystem: true,
        userId: session.user.id,
      }
    })
    createdTypes[typeData.name] = created.id
  }

  // Link reverse relationships
  // Father/Mother -> Son (male) / Daughter (female)
  await prisma.relationshipType.update({
    where: { id: createdTypes['Father'] },
    data: {
      maleReverseTypeId: createdTypes['Son'],
      femaleReverseTypeId: createdTypes['Daughter'],
    }
  })
  await prisma.relationshipType.update({
    where: { id: createdTypes['Mother'] },
    data: {
      maleReverseTypeId: createdTypes['Son'],
      femaleReverseTypeId: createdTypes['Daughter'],
    }
  })
  
  // Son/Daughter -> Father/Mother (we'll use Father as default reverse)
  await prisma.relationshipType.update({
    where: { id: createdTypes['Son'] },
    data: { reverseTypeId: createdTypes['Father'] }
  })
  await prisma.relationshipType.update({
    where: { id: createdTypes['Daughter'] },
    data: { reverseTypeId: createdTypes['Father'] }
  })

  // Manager <-> Direct Report
  await prisma.relationshipType.update({
    where: { id: createdTypes['Manager'] },
    data: { reverseTypeId: createdTypes['Direct Report'] }
  })
  await prisma.relationshipType.update({
    where: { id: createdTypes['Direct Report'] },
    data: { reverseTypeId: createdTypes['Manager'] }
  })

  // Mentor <-> Mentee
  await prisma.relationshipType.update({
    where: { id: createdTypes['Mentor'] },
    data: { reverseTypeId: createdTypes['Mentee'] }
  })
  await prisma.relationshipType.update({
    where: { id: createdTypes['Mentee'] },
    data: { reverseTypeId: createdTypes['Mentor'] }
  })

  return await prisma.relationshipType.findMany({
    where: { userId: session.user.id },
    orderBy: { name: 'asc' }
  })
}

export async function getRelationshipTypes() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Ensure default types exist
  await ensureDefaultRelationshipTypes()

  return await prisma.relationshipType.findMany({
    where: { userId: session.user.id },
    include: {
      reverseType: true,
      maleReverseType: true,
      femaleReverseType: true,
      _count: {
        select: { relationships: true }
      }
    },
    orderBy: { name: 'asc' }
  })
}

export async function createRelationshipType(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  const data = {
    name: formData.get("name") as string,
    isSymmetric: formData.get("isSymmetric") === "true",
    reverseTypeId: formData.get("reverseTypeId") as string || undefined,
    maleReverseTypeId: formData.get("maleReverseTypeId") as string || undefined,
    femaleReverseTypeId: formData.get("femaleReverseTypeId") as string || undefined,
  }

  const validated = relationshipTypeSchema.parse(data)

  // Check if name already exists for this user
  const existing = await prisma.relationshipType.findUnique({
    where: {
      userId_name: {
        userId: session.user.id,
        name: validated.name
      }
    }
  })

  if (existing) {
    throw new Error("Relationship type with this name already exists")
  }

  await prisma.relationshipType.create({
    data: {
      name: validated.name,
      isSymmetric: validated.isSymmetric,
      reverseTypeId: validated.reverseTypeId || null,
      maleReverseTypeId: validated.maleReverseTypeId || null,
      femaleReverseTypeId: validated.femaleReverseTypeId || null,
      isSystem: false,
      userId: session.user.id,
    },
  })

  revalidatePath("/settings")
  revalidatePath("/contacts")
}

export async function updateRelationshipType(typeId: string, formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Verify ownership
  const existing = await prisma.relationshipType.findUnique({
    where: { id: typeId },
    select: { userId: true, isSystem: true }
  })
  
  if (!existing || existing.userId !== session.user.id) {
    throw new Error("Relationship type not found")
  }

  const data = {
    name: formData.get("name") as string,
    isSymmetric: formData.get("isSymmetric") === "true",
    reverseTypeId: formData.get("reverseTypeId") as string || undefined,
    maleReverseTypeId: formData.get("maleReverseTypeId") as string || undefined,
    femaleReverseTypeId: formData.get("femaleReverseTypeId") as string || undefined,
  }

  const validated = relationshipTypeSchema.parse(data)

  await prisma.relationshipType.update({
    where: { id: typeId },
    data: {
      name: validated.name,
      isSymmetric: validated.isSymmetric,
      reverseTypeId: validated.reverseTypeId || null,
      maleReverseTypeId: validated.maleReverseTypeId || null,
      femaleReverseTypeId: validated.femaleReverseTypeId || null,
    },
  })

  revalidatePath("/settings")
  revalidatePath("/contacts")
}

export async function deleteRelationshipType(typeId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Verify ownership
  const existing = await prisma.relationshipType.findUnique({
    where: { id: typeId },
    select: { userId: true, isSystem: true }
  })
  
  if (!existing || existing.userId !== session.user.id) {
    throw new Error("Relationship type not found")
  }

  if (existing.isSystem) {
    throw new Error("Cannot delete system relationship types")
  }

  // Delete relationship type (cascade will remove relationships)
  await prisma.relationshipType.delete({
    where: { id: typeId },
  })

  revalidatePath("/settings")
  revalidatePath("/contacts")
}


