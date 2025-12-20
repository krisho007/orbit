import { auth } from "@/auth"
import { notFound } from "next/navigation"
import { ContactDetail } from "@/components/contacts/contact-detail"
import { getContactDetailOptimized } from "@/lib/queries/contact-detail"

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params
  
  // Use optimized query that reduces database round trips
  const contact = await getContactDetailOptimized(id, session!.user.id)

  if (!contact) {
    notFound()
  }

  return (
    <div className="p-4 md:p-8">
      <ContactDetail contact={contact} />
    </div>
  )
}


