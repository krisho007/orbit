"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { uploadBase64Image } from "@/lib/supabase"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

const contactSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  primaryPhone: z.string().optional(),
  primaryEmail: z.string().email().optional().or(z.literal("")),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
})

export async function createContact(formData: FormData): Promise<{ id: string }> {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  const genderValue = formData.get("gender") as string | null
  const data = {
    displayName: formData.get("displayName") as string,
    primaryPhone: formData.get("primaryPhone") as string || undefined,
    primaryEmail: formData.get("primaryEmail") as string || undefined,
    dateOfBirth: formData.get("dateOfBirth") as string || undefined,
    gender: genderValue === 'MALE' || genderValue === 'FEMALE' ? genderValue : undefined,
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
      gender: validated.gender || null,
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
  
  // Return the contact ID so the form can handle image upload before redirect
  return { id: contact.id }
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

  const genderValue = formData.get("gender") as string | null
  const data = {
    displayName: formData.get("displayName") as string,
    primaryPhone: formData.get("primaryPhone") as string || undefined,
    primaryEmail: formData.get("primaryEmail") as string || undefined,
    dateOfBirth: formData.get("dateOfBirth") as string || undefined,
    gender: genderValue === 'MALE' || genderValue === 'FEMALE' ? genderValue : undefined,
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
      gender: validated.gender || null,
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

export async function addRelationship(
  fromContactId: string, 
  toContactId: string, 
  typeId: string, 
  targetGender?: 'MALE' | 'FEMALE',
  notes?: string
) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  // Verify ownership of both contacts and get their data
  const contacts = await prisma.contact.findMany({
    where: {
      id: { in: [fromContactId, toContactId] },
      userId: session.user.id
    }
  })

  if (contacts.length !== 2) {
    throw new Error("Invalid contacts")
  }

  const toContact = contacts.find(c => c.id === toContactId)!

  // Get the relationship type with its reverse types
  const relationshipType = await prisma.relationshipType.findUnique({
    where: { id: typeId },
    include: {
      reverseType: true,
      maleReverseType: true,
      femaleReverseType: true,
    }
  })

  if (!relationshipType || relationshipType.userId !== session.user.id) {
    throw new Error("Invalid relationship type")
  }

  // Update target contact's gender if provided and different
  const effectiveGender = targetGender || toContact.gender
  if (targetGender && targetGender !== toContact.gender) {
    await prisma.contact.update({
      where: { id: toContactId },
      data: { gender: targetGender }
    })
  }

  // Create the primary relationship
  await prisma.relationship.create({
    data: {
      fromContactId,
      toContactId,
      typeId,
      notes: notes || null,
      userId: session.user.id
    }
  })

  // Determine the reverse type
  let reverseTypeId: string | null = null
  
  if (relationshipType.isSymmetric) {
    // For symmetric relationships, use the same type
    reverseTypeId = typeId
  } else {
    // For asymmetric, check gender-specific reverses first
    if (effectiveGender === 'MALE' && relationshipType.maleReverseTypeId) {
      reverseTypeId = relationshipType.maleReverseTypeId
    } else if (effectiveGender === 'FEMALE' && relationshipType.femaleReverseTypeId) {
      reverseTypeId = relationshipType.femaleReverseTypeId
    } else if (relationshipType.reverseTypeId) {
      reverseTypeId = relationshipType.reverseTypeId
    }
  }

  // Create the reverse relationship if we have a reverse type
  if (reverseTypeId) {
    // Check if reverse relationship already exists
    const existingReverse = await prisma.relationship.findFirst({
      where: {
        fromContactId: toContactId,
        toContactId: fromContactId,
        typeId: reverseTypeId,
        userId: session.user.id
      }
    })

    if (!existingReverse) {
      await prisma.relationship.create({
        data: {
          fromContactId: toContactId,
          toContactId: fromContactId,
          typeId: reverseTypeId,
          notes: notes || null,
          userId: session.user.id
        }
      })
    }
  }

  revalidatePath(`/contacts/${fromContactId}`)
  revalidatePath(`/contacts/${toContactId}`)
}

export async function deleteRelationship(relationshipId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  const relationship = await prisma.relationship.findUnique({
    where: { id: relationshipId },
    include: {
      type: {
        include: {
          reverseType: true,
          maleReverseType: true,
          femaleReverseType: true,
        }
      }
    }
  })

  if (!relationship || relationship.userId !== session.user.id) {
    throw new Error("Relationship not found")
  }

  // Find and delete the reverse relationship
  const reverseTypeIds: string[] = []
  if (relationship.type.isSymmetric) {
    reverseTypeIds.push(relationship.typeId)
  } else {
    if (relationship.type.reverseTypeId) reverseTypeIds.push(relationship.type.reverseTypeId)
    if (relationship.type.maleReverseTypeId) reverseTypeIds.push(relationship.type.maleReverseTypeId)
    if (relationship.type.femaleReverseTypeId) reverseTypeIds.push(relationship.type.femaleReverseTypeId)
  }

  if (reverseTypeIds.length > 0) {
    await prisma.relationship.deleteMany({
      where: {
        fromContactId: relationship.toContactId,
        toContactId: relationship.fromContactId,
        typeId: { in: reverseTypeIds },
        userId: session.user.id
      }
    })
  }

  // Delete the primary relationship
  await prisma.relationship.delete({
    where: { id: relationshipId }
  })

  revalidatePath(`/contacts/${relationship.fromContactId}`)
  revalidatePath(`/contacts/${relationship.toContactId}`)
}

// Helper function to get all contacts for relationship dialog
export async function getContactsForRelationship() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  return await prisma.contact.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      displayName: true,
      gender: true,
    },
    orderBy: { displayName: 'asc' }
  })
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

// Helper function to revalidate paths after import is complete
export async function revalidateContactsAfterImport() {
  "use server"
  revalidatePath("/contacts")
  revalidatePath("/settings")
}

// Optimized batch import function with bulk inserts for faster performance
// Does NOT call revalidatePath - caller should call revalidateContactsAfterImport() once at the end
/**
 * Process Google contact photos by downloading and uploading them to Supabase
 * This runs asynchronously after contacts are created to not block the import
 */
async function processGoogleContactPhotos(
  contactsData: any[],
  createdContacts: { id: string; googleContactName: string | null }[]
) {
  // Create a map of googleContactName to contactId for quick lookup
  const nameToIdMap = new Map(
    createdContacts.map(c => [c.googleContactName, c.id])
  )

  // Get contact IDs that already have images (to avoid re-uploading)
  const existingImages = await prisma.contactImage.findMany({
    where: {
      contactId: { in: Array.from(nameToIdMap.values()) },
      order: 0
    },
    select: { contactId: true }
  })
  const contactsWithImages = new Set(existingImages.map(img => img.contactId))

  // Process photos for contacts that have base64 photo data
  const photoPromises = contactsData
    .filter(contact => contact.photoBase64 && contact.photoContentType)
    .map(async (contact) => {
      const contactId = nameToIdMap.get(contact.displayName)
      if (!contactId) return

      // If contact already has an image, delete it first
      if (contactsWithImages.has(contactId)) {
        const oldImage = await prisma.contactImage.findFirst({
          where: { contactId, order: 0 }
        })
        if (oldImage) {
          await prisma.contactImage.delete({ where: { id: oldImage.id } })
        }
      }

      try {
        // Upload the base64 photo data
        const result = await uploadBase64Image(
          contact.photoBase64,
          contact.photoContentType,
          contactId
        )

        if (result) {
          // Create the ContactImage record
          await prisma.contactImage.create({
            data: {
              contactId,
              imageUrl: result.url,
              publicId: result.publicId,
              order: 0, // Primary avatar
            }
          })
        }
      } catch (error) {
        console.error(`Failed to process photo for contact ${contact.displayName}:`, error)
        // Continue processing other photos even if one fails
      }
    })

  // Process all photos in parallel (but don't block the response)
  await Promise.allSettled(photoPromises)
}

export async function importGoogleContactsBatch(
  contacts: any[], 
  batchSize: number = 50,
  overrideExisting: boolean = false
) {
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
  let updated = 0
  let skipped = 0
  let errors = 0

  // Pre-filter contacts without names
  const validContacts = contacts.filter(
    contact => contact.displayName && contact.displayName !== "Unknown"
  )
  
  skipped += contacts.length - validContacts.length

  // Batch fetch all existing contacts to minimize database queries
  // Check for duplicates by: googleContactName, phone, or email
  const googleNames = validContacts.map(c => c.displayName).filter(Boolean)
  const emails = validContacts.map(c => c.primaryEmail).filter(Boolean)
  const phones = validContacts.map(c => c.primaryPhone).filter(Boolean)

  const existingContacts = await prisma.contact.findMany({
    where: {
      userId: session.user.id,
      OR: [
        { googleContactName: { in: googleNames } },
        ...(phones.length > 0 ? [{ primaryPhone: { in: phones } }] : []),
        ...(emails.length > 0 ? [{ primaryEmail: { in: emails } }] : []),
      ],
    },
    select: {
      id: true,
      googleContactName: true,
      primaryEmail: true,
      primaryPhone: true,
    }
  })

  // Create Sets for quick lookups - prioritize phone and googleName
  const existingGoogleNames = new Set(
    existingContacts.map(c => c.googleContactName).filter(Boolean)
  )
  const existingPhones = new Set(
    existingContacts.map(c => c.primaryPhone).filter(Boolean)
  )
  const existingEmails = new Set(
    existingContacts.map(c => c.primaryEmail).filter(Boolean)
  )

  // Separate contacts into create and update lists
  const contactsToCreate: any[] = []
  const contactsToUpdate: Array<{ existingId: string, data: any }> = []

  for (const contact of validContacts) {
    // Find existing contact match
    const existingContact = existingContacts.find(ec => 
      ec.googleContactName === contact.displayName ||
      (contact.primaryPhone && ec.primaryPhone === contact.primaryPhone) ||
      (contact.primaryEmail && ec.primaryEmail === contact.primaryEmail)
    )

    if (existingContact) {
      if (overrideExisting) {
        // Add to update list
        contactsToUpdate.push({
          existingId: existingContact.id,
          data: contact
        })
      } else {
        // Skip this contact
        skipped++
      }
    } else {
      // New contact - add to create list
      contactsToCreate.push(contact)
      
      // Track in-memory to prevent duplicates within the same batch
      existingGoogleNames.add(contact.displayName)
      if (contact.primaryPhone) existingPhones.add(contact.primaryPhone)
      if (contact.primaryEmail) existingEmails.add(contact.primaryEmail)
    }
  }

  if (contactsToCreate.length === 0 && contactsToUpdate.length === 0) {
    return { imported, updated, skipped, errors }
  }

  try {
    // Use a transaction for atomicity with extended timeout for large imports
    const result = await prisma.$transaction(async (tx) => {
      let createdContacts: { id: string; googleContactName: string | null }[] = []
      let updatedContactIds: string[] = []

      // 1. Bulk insert new contacts
      if (contactsToCreate.length > 0) {
        const createResult = await tx.contact.createMany({
          data: contactsToCreate.map(contact => ({
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
          })),
          skipDuplicates: true,
        })

        // Fetch the created contacts to get their IDs
        createdContacts = await tx.contact.findMany({
          where: {
            userId: session.user.id,
            googleContactName: { in: contactsToCreate.map(c => c.displayName) },
          },
          select: { id: true, googleContactName: true }
        })

        // Bulk create tag associations for new contacts
        if (createdContacts.length > 0) {
          await tx.contactTag.createMany({
            data: createdContacts.map(contact => ({
              contactId: contact.id,
              tagId: googleImportTag.id,
            })),
            skipDuplicates: true,
          })
        }
      }

      // 2. Update existing contacts - run in parallel for better performance
      if (contactsToUpdate.length > 0) {
        const updatePromises = contactsToUpdate.map(({ existingId, data }) =>
          tx.contact.update({
            where: { id: existingId },
            data: {
              displayName: data.displayName,
              googleContactName: data.displayName,
              primaryEmail: data.primaryEmail || null,
              primaryPhone: data.primaryPhone || null,
              company: data.company || null,
              jobTitle: data.jobTitle || null,
              location: data.location || null,
              notes: data.notes || null,
              dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
            }
          })
        )
        await Promise.all(updatePromises)
        updatedContactIds = contactsToUpdate.map(cu => cu.existingId)
      }

      return {
        createdContacts,
        updatedContactIds,
        createdCount: createdContacts.length,
        updatedCount: updatedContactIds.length
      }
    }, {
      timeout: 60000, // 60 seconds timeout for large imports
    })

    imported = result.createdCount
    updated = result.updatedCount

    // Handle photo uploads AFTER the transaction for new contacts
    if (result.createdContacts.length > 0) {
      processGoogleContactPhotos(contactsToCreate, result.createdContacts).catch(err => {
        console.error("Error processing contact photos for new contacts:", err)
      })
    }

    // Handle photo uploads for updated contacts
    if (result.updatedContactIds.length > 0 && overrideExisting) {
      const updatedContactsData = contactsToUpdate.map(cu => ({
        id: cu.existingId,
        googleContactName: cu.data.displayName,
        photoUrl: cu.data.photoUrl
      }))
      
      processGoogleContactPhotos(
        contactsToUpdate.map(cu => cu.data),
        updatedContactsData.map(uc => ({ id: uc.id, googleContactName: uc.googleContactName }))
      ).catch(err => {
        console.error("Error processing contact photos for updated contacts:", err)
      })
    }
  } catch (error) {
    console.error("Batch import error:", error)
    errors = contactsToCreate.length + contactsToUpdate.length
  }
  
  return { imported, updated, skipped, errors }
}

