import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { ContactForm } from "@/components/contacts/contact-form"
import { FiEdit } from "react-icons/fi"

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params
  
  const contact = await prisma.contact.findUnique({
    where: { 
      id,
      userId: session?.user?.id
    },
    include: {
      tags: {
        include: {
          tag: true
        }
      }
    }
  })

  if (!contact) {
    notFound()
  }

  // Fetch available tags
  const availableTags = await prisma.tag.findMany({
    where: { userId: session?.user?.id },
    orderBy: { name: 'asc' }
  })

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-2">
          <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-lg">
            <FiEdit className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Edit Contact</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Update {contact.displayName}'s information</p>
          </div>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 p-8">
        <ContactForm contact={contact} availableTags={availableTags} />
      </div>
    </div>
  )
}

