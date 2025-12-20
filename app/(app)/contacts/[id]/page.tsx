import { auth } from "@/auth"
import { notFound } from "next/navigation"
import { ContactDetail } from "@/components/contacts/contact-detail"
import { getContactDetailOptimized, getAllContactsSimple, getRelationshipTypesWithReverse } from "@/lib/queries/contact-detail"

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params
  
  // Fetch all required data in parallel
  const [contact, allContacts, relationshipTypes] = await Promise.all([
    getContactDetailOptimized(id, session!.user.id),
    getAllContactsSimple(session!.user.id),
    getRelationshipTypesWithReverse(session!.user.id)
  ])

  if (!contact) {
    notFound()
  }

  return (
    <div className="p-4 md:p-8">
      <ContactDetail 
        contact={contact} 
        allContacts={allContacts}
        relationshipTypes={relationshipTypes}
      />
    </div>
  )
}


