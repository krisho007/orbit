"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

const contactSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  primaryPhone: z.string().optional(),
  primaryEmail: z.string().email().optional().or(z.literal("")),
  dateOfBirth: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
})

export async function createContact(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  const data = {
    displayName: formData.get("displayName") as string,
    primaryPhone: formData.get("primaryPhone") as string || undefined,
    primaryEmail: formData.get("primaryEmail") as string || undefined,
    dateOfBirth: formData.get("dateOfBirth") as string || undefined,
    company: formData.get("company") as string || undefined,
    jobTitle: formData.get("jobTitle") as string || undefined,
    location: formData.get("location") as string || undefined,
    notes: formData.get("notes") as string || undefined,
  }

  const validated = contactSchema.parse(data)

  // Get tags from form data
  const tagsJson = formData.get("tags") as string
  const tagData = tagsJson ? JSON.parse(tagsJson) : []

  // Process tags - create new ones if they don't exist
  const processedTagIds: string[] = []
  
  for (const item of tagData) {
    if (item.id.startsWith('temp-')) {
      // Create new tag
      const newTag = await prisma.tag.upsert({
        where: {
          userId_name: {
            userId: session.user.id,
            name: item.name
          }
        },
        create: {
          name: item.name,
          color: item.color || '#7C3AED',
          userId: session.user.id
        },
        update: {}
      })
      processedTagIds.push(newTag.id)
    } else {
      // Use existing tag
      processedTagIds.push(item.id || item)
    }
  }

  const contact = await prisma.contact.create({
    data: {
      ...validated,
      dateOfBirth: validated.dateOfBirth ? new Date(validated.dateOfBirth) : null,
      userId: session.user.id,
      tags: processedTagIds.length > 0 ? {
        create: processedTagIds.map((tagId: string) => ({
          tag: {
            connect: { id: tagId }
          }
        }))
      } : undefined
    },
  })

  revalidatePath("/contacts")
  revalidatePath("/settings")
  redirect(`/contacts/${contact.id}`)
}

export async function updateContact(contactId: string, formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Verify ownership
  const existing = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { userId: true }
  })
  
  if (!existing || existing.userId !== session.user.id) {
    throw new Error("Contact not found")
  }

  const data = {
    displayName: formData.get("displayName") as string,
    primaryPhone: formData.get("primaryPhone") as string || undefined,
    primaryEmail: formData.get("primaryEmail") as string || undefined,
    dateOfBirth: formData.get("dateOfBirth") as string || undefined,
    company: formData.get("company") as string || undefined,
    jobTitle: formData.get("jobTitle") as string || undefined,
    location: formData.get("location") as string || undefined,
    notes: formData.get("notes") as string || undefined,
  }

  const validated = contactSchema.parse(data)

  // Get tags from form data
  const tagsJson = formData.get("tags") as string
  const tagData = tagsJson ? JSON.parse(tagsJson) : []

  // Process tags - create new ones if they don't exist
  const processedTagIds: string[] = []
  
  for (const item of tagData) {
    if (item.id && item.id.startsWith('temp-')) {
      // Create new tag
      const newTag = await prisma.tag.upsert({
        where: {
          userId_name: {
            userId: session.user.id,
            name: item.name
          }
        },
        create: {
          name: item.name,
          color: item.color || '#7C3AED',
          userId: session.user.id
        },
        update: {}
      })
      processedTagIds.push(newTag.id)
    } else {
      // Use existing tag
      processedTagIds.push(item.id || item)
    }
  }

  // Delete all existing tags first, then add new ones
  await prisma.contactTag.deleteMany({
    where: { contactId }
  })

  if (processedTagIds.length > 0) {
    await prisma.contactTag.createMany({
      data: processedTagIds.map((tagId: string) => ({
        contactId,
        tagId
      }))
    })
  }

  await prisma.contact.update({
    where: { id: contactId },
    data: {
      ...validated,
      dateOfBirth: validated.dateOfBirth ? new Date(validated.dateOfBirth) : null,
    },
  })

  revalidatePath("/contacts")
  revalidatePath("/settings")
  revalidatePath(`/contacts/${contactId}`)
  redirect(`/contacts/${contactId}`)
}

export async function deleteContact(contactId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Verify ownership
  const existing = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { userId: true }
  })
  
  if (!existing || existing.userId !== session.user.id) {
    throw new Error("Contact not found")
  }

  await prisma.contact.delete({
    where: { id: contactId },
  })

  revalidatePath("/contacts")
  redirect("/contacts")
}

export async function addTagToContact(contactId: string, tagId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Verify ownership of both contact and tag
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { userId: true }
  })
  
  const tag = await prisma.tag.findUnique({
    where: { id: tagId },
    select: { userId: true }
  })
  
  if (!contact || contact.userId !== session.user.id) {
    throw new Error("Contact not found")
  }
  
  if (!tag || tag.userId !== session.user.id) {
    throw new Error("Tag not found")
  }

  await prisma.contactTag.create({
    data: {
      contactId,
      tagId,
    },
  })

  revalidatePath(`/contacts/${contactId}`)
}

export async function removeTagFromContact(contactId: string, tagId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Verify ownership
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { userId: true }
  })
  
  if (!contact || contact.userId !== session.user.id) {
    throw new Error("Contact not found")
  }

  await prisma.contactTag.deleteMany({
    where: {
      contactId,
      tagId,
    },
  })

  revalidatePath(`/contacts/${contactId}`)
}

export async function addContactImage(contactId: string, imageUrl: string, publicId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Verify ownership
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { userId: true }
  })
  
  if (!contact || contact.userId !== session.user.id) {
    throw new Error("Contact not found")
  }

  // Check image count (max 2)
  const imageCount = await prisma.contactImage.count({
    where: { contactId }
  })

  if (imageCount >= 2) {
    throw new Error("Maximum 2 images per contact")
  }

  await prisma.contactImage.create({
    data: {
      contactId,
      imageUrl,
      publicId,
      order: imageCount
    }
  })

  revalidatePath(`/contacts/${contactId}`)
}

export async function deleteContactImage(imageId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Verify ownership via contact
  const image = await prisma.contactImage.findUnique({
    where: { id: imageId },
    include: {
      contact: {
        select: { userId: true }
      }
    }
  })
  
  if (!image || image.contact.userId !== session.user.id) {
    throw new Error("Image not found")
  }

  // Delete from storage if publicId exists
  if (image.publicId) {
    try {
      const { deleteContactImage: deleteFromStorage } = await import("@/lib/supabase")
      await deleteFromStorage(image.publicId)
    } catch (error) {
      console.error("Failed to delete from storage:", error)
    }
  }

  await prisma.contactImage.delete({
    where: { id: imageId }
  })

  revalidatePath(`/contacts/${image.contactId}`)
}

export async function addRelationship(fromContactId: string, toContactId: string, type: string, notes?: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Verify ownership of both contacts
  const contacts = await prisma.contact.findMany({
    where: {
      id: { in: [fromContactId, toContactId] },
      userId: session.user.id
    }
  })

  if (contacts.length !== 2) {
    throw new Error("Invalid contacts")
  }

  await prisma.relationship.create({
    data: {
      fromContactId,
      toContactId,
      type: type as any,
      notes: notes || null,
      userId: session.user.id
    }
  })

  revalidatePath(`/contacts/${fromContactId}`)
  revalidatePath(`/contacts/${toContactId}`)
}

export async function deleteRelationship(relationshipId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  const relationship = await prisma.relationship.findUnique({
    where: { id: relationshipId },
    select: { userId: true, fromContactId: true, toContactId: true }
  })

  if (!relationship || relationship.userId !== session.user.id) {
    throw new Error("Relationship not found")
  }

  await prisma.relationship.delete({
    where: { id: relationshipId }
  })

  revalidatePath(`/contacts/${relationship.fromContactId}`)
  revalidatePath(`/contacts/${relationship.toContactId}`)
}

export async function addSocialLink(contactId: string, platform: string, url: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { userId: true }
  })

  if (!contact || contact.userId !== session.user.id) {
    throw new Error("Contact not found")
  }

  await prisma.socialLink.create({
    data: {
      contactId,
      platform,
      url
    }
  })

  revalidatePath(`/contacts/${contactId}`)
}

export async function deleteSocialLink(linkId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  const link = await prisma.socialLink.findUnique({
    where: { id: linkId },
    include: {
      contact: {
        select: { userId: true, id: true }
      }
    }
  })

  if (!link || link.contact.userId !== session.user.id) {
    throw new Error("Social link not found")
  }

  await prisma.socialLink.delete({
    where: { id: linkId }
  })

  revalidatePath(`/contacts/${link.contactId}`)
}

export async function importGoogleContacts(contacts: any[]) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  let imported = 0
  let skipped = 0
  let errors = 0

  // Create or get the "Google Import" tag
  const googleImportTag = await prisma.tag.upsert({
    where: {
      userId_name: {
        userId: session.user.id,
        name: "Google Import"
      }
    },
    create: {
      name: "Google Import",
      color: "#4285F4", // Google blue
      userId: session.user.id
    },
    update: {}
  })

  for (const contact of contacts) {
    try {
      // Skip contacts without a name
      if (!contact.displayName || contact.displayName === "Unknown") {
        skipped++
        continue
      }

      // Check if contact already exists
      // Priority: googleContactName (for re-imports) > email > current displayName
      const existing = await prisma.contact.findFirst({
        where: {
          userId: session.user.id,
          OR: [
            { googleContactName: contact.displayName }, // Match against original Google name
            ...(contact.primaryEmail ? [{ primaryEmail: contact.primaryEmail }] : []),
          ],
        },
      })

      if (existing) {
        skipped++
        continue
      }

      // Create the contact with the Google Import tag
      await prisma.contact.create({
        data: {
          displayName: contact.displayName,
          googleContactName: contact.displayName, // Store original Google name
          primaryEmail: contact.primaryEmail || null,
          primaryPhone: contact.primaryPhone || null,
          company: contact.company || null,
          jobTitle: contact.jobTitle || null,
          location: contact.location || null,
          notes: contact.notes || null,
          dateOfBirth: contact.dateOfBirth ? new Date(contact.dateOfBirth) : null,
          userId: session.user.id,
          tags: {
            create: {
              tagId: googleImportTag.id
            }
          }
        },
      })

      imported++
    } catch (error) {
      console.error("Error importing contact:", contact.displayName, error)
      errors++
    }
  }

  revalidatePath("/contacts")
  revalidatePath("/settings")
  
  return { imported, skipped, errors }
}

// New batch import function that processes contacts in chunks with optimized queries
export async function importGoogleContactsBatch(contacts: any[], batchSize: number = 50) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Create or get the "Google Import" tag
  const googleImportTag = await prisma.tag.upsert({
    where: {
      userId_name: {
        userId: session.user.id,
        name: "Google Import"
      }
    },
    create: {
      name: "Google Import",
      color: "#4285F4", // Google blue
      userId: session.user.id
    },
    update: {}
  })

  let imported = 0
  let skipped = 0
  let errors = 0

  // Pre-filter contacts without names
  const validContacts = contacts.filter(
    contact => contact.displayName && contact.displayName !== "Unknown"
  )
  
  skipped += contacts.length - validContacts.length

  // Batch fetch all existing contacts to minimize database queries
  // Get all emails and google names from the batch
  const googleNames = validContacts.map(c => c.displayName).filter(Boolean)
  const emails = validContacts.map(c => c.primaryEmail).filter(Boolean)

  const existingContacts = await prisma.contact.findMany({
    where: {
      userId: session.user.id,
      OR: [
        { googleContactName: { in: googleNames } },
        ...(emails.length > 0 ? [{ primaryEmail: { in: emails } }] : []),
      ],
    },
    select: {
      googleContactName: true,
      primaryEmail: true,
    }
  })

  // Create a Set for quick lookups
  const existingGoogleNames = new Set(
    existingContacts.map(c => c.googleContactName).filter(Boolean)
  )
  const existingEmails = new Set(
    existingContacts.map(c => c.primaryEmail).filter(Boolean)
  )

  // Process contacts in the batch
  for (const contact of validContacts) {
    try {
      // Check if contact already exists using our pre-fetched data
      const alreadyExists = 
        existingGoogleNames.has(contact.displayName) ||
        (contact.primaryEmail && existingEmails.has(contact.primaryEmail))

      if (alreadyExists) {
        skipped++
        continue
      }

      // Create the contact with the Google Import tag
      await prisma.contact.create({
        data: {
          displayName: contact.displayName,
          googleContactName: contact.displayName,
          primaryEmail: contact.primaryEmail || null,
          primaryPhone: contact.primaryPhone || null,
          company: contact.company || null,
          jobTitle: contact.jobTitle || null,
          location: contact.location || null,
          notes: contact.notes || null,
          dateOfBirth: contact.dateOfBirth ? new Date(contact.dateOfBirth) : null,
          userId: session.user.id,
          tags: {
            create: {
              tagId: googleImportTag.id
            }
          }
        },
      })

      // Add to our tracking sets to prevent duplicates within the same batch
      existingGoogleNames.add(contact.displayName)
      if (contact.primaryEmail) {
        existingEmails.add(contact.primaryEmail)
      }

      imported++
    } catch (error) {
      console.error("Error importing contact:", contact.displayName, error)
      errors++
    }
  }

  // Only revalidate once per batch instead of after every contact
  revalidatePath("/contacts")
  revalidatePath("/settings")
  
  return { imported, skipped, errors }
}

