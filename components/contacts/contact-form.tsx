"use client"

import { useState } from "react"
import { createContact, updateContact } from "@/app/(app)/contacts/actions"
import { FiSave, FiX, FiUser, FiMail, FiPhone, FiCalendar, FiBriefcase, FiMapPin, FiFileText, FiTag } from "react-icons/fi"
import { useRouter } from "next/navigation"
import { TagInput } from "@/components/contacts/tag-input"
import type { Contact, ContactTag, Tag } from "@prisma/client"

type ContactWithTags = Contact & {
  tags?: (ContactTag & { tag: Tag })[]
}

type SimpleTag = {
  id: string
  name: string
  color: string | null
}

interface ContactFormProps {
  contact?: ContactWithTags
  availableTags: SimpleTag[]
}

export function ContactForm({ contact, availableTags }: ContactFormProps) {
  const router = useRouter()
  
  // Initialize selected tags from contact data
  const initialTags = contact?.tags?.map(ct => ct.tag) || []
  const [selectedTags, setSelectedTags] = useState<SimpleTag[]>(initialTags)

  const handleSubmit = async (formData: FormData) => {
    // Add selected tags (full objects) to form data
    // This allows us to create new tags on the backend
    const tagsData = selectedTags.map(tag => ({
      id: tag.id,
      name: tag.name,
      color: tag.color
    }))
    formData.append('tags', JSON.stringify(tagsData))
    
    if (contact) {
      await updateContact(contact.id, formData)
    } else {
      await createContact(formData)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-8">
      {/* Personal Information Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <FiUser className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Personal Information</h3>
        </div>

        <div>
          <label htmlFor="displayName" className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Display Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="displayName"
            name="displayName"
            required
            defaultValue={contact?.displayName}
            placeholder="Enter full name"
            className="w-full px-4 py-3 text-base bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="primaryEmail" className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
              <div className="flex items-center gap-2">
                <FiMail className="h-4 w-4 text-gray-400" />
                Email
              </div>
            </label>
            <input
              type="email"
              id="primaryEmail"
              name="primaryEmail"
              defaultValue={contact?.primaryEmail || ''}
              placeholder="name@example.com"
              className="w-full px-4 py-3 text-base bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-all"
            />
          </div>

          <div>
            <label htmlFor="primaryPhone" className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
              <div className="flex items-center gap-2">
                <FiPhone className="h-4 w-4 text-gray-400" />
                Phone
              </div>
            </label>
            <input
              type="tel"
              id="primaryPhone"
              name="primaryPhone"
              defaultValue={contact?.primaryPhone || ''}
              placeholder="+1 (555) 000-0000"
              className="w-full px-4 py-3 text-base bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-all"
            />
          </div>
        </div>

        <div>
          <label htmlFor="dateOfBirth" className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            <div className="flex items-center gap-2">
              <FiCalendar className="h-4 w-4 text-gray-400" />
              Date of Birth
            </div>
          </label>
          <input
            type="date"
            id="dateOfBirth"
            name="dateOfBirth"
            defaultValue={contact?.dateOfBirth ? new Date(contact.dateOfBirth).toISOString().split('T')[0] : ''}
            className="w-full px-4 py-3 text-base bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 dark:text-gray-100 transition-all"
          />
        </div>
      </div>

      {/* Professional Information Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <FiBriefcase className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Professional Information</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="company" className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Company
            </label>
            <input
              type="text"
              id="company"
              name="company"
              defaultValue={contact?.company || ''}
              placeholder="Company name"
              className="w-full px-4 py-3 text-base bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-all"
            />
          </div>

          <div>
            <label htmlFor="jobTitle" className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Job Title
            </label>
            <input
              type="text"
              id="jobTitle"
              name="jobTitle"
              defaultValue={contact?.jobTitle || ''}
              placeholder="Position or role"
              className="w-full px-4 py-3 text-base bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-all"
            />
          </div>
        </div>

        <div>
          <label htmlFor="location" className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            <div className="flex items-center gap-2">
              <FiMapPin className="h-4 w-4 text-gray-400" />
              Location
            </div>
          </label>
          <input
            type="text"
            id="location"
            name="location"
            defaultValue={contact?.location || ''}
            placeholder="City, State, Country"
            className="w-full px-4 py-3 text-base bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-all"
          />
        </div>
      </div>

      {/* Tags Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <FiTag className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tags</h3>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Organize with tags
          </label>
          <TagInput
            availableTags={availableTags}
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
          />
        </div>
      </div>

      {/* Additional Information Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <FiFileText className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Additional Information</h3>
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={5}
            defaultValue={contact?.notes || ''}
            placeholder="Add any additional notes about this contact..."
            className="w-full px-4 py-3 text-base bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-all resize-none"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 pt-6 border-t border-gray-200 dark:border-gray-700">
        <button
          type="submit"
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-purple-600 text-white text-base font-semibold rounded-xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40"
        >
          <FiSave className="h-5 w-5" />
          {contact ? 'Update Contact' : 'Create Contact'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-3.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-base font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
        >
          <FiX className="h-5 w-5" />
        </button>
      </div>
    </form>
  )
}


