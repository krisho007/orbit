"use client"

import { createConversation, updateConversation } from "@/app/(app)/conversations/actions"
import { FiSave, FiX } from "react-icons/fi"
import { useRouter } from "next/navigation"
import { ConversationMedium, type Conversation } from "@prisma/client"

interface ConversationFormProps {
  contacts: { id: string; displayName: string }[]
  events: { id: string; title: string; startAt: Date }[]
  conversation?: Conversation & {
    participants: { contactId: string }[]
  }
}

const mediumOptions: { value: ConversationMedium; label: string }[] = [
  { value: "PHONE_CALL", label: "Phone Call" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "CHANCE_ENCOUNTER", label: "Chance Encounter" },
  { value: "ONLINE_MEETING", label: "Online Meeting" },
  { value: "IN_PERSON_MEETING", label: "In-Person Meeting" },
  { value: "OTHER", label: "Other" },
]

export function ConversationForm({ contacts, events, conversation }: ConversationFormProps) {
  const router = useRouter()

  const handleSubmit = async (formData: FormData) => {
    if (conversation) {
      await updateConversation(conversation.id, formData)
    } else {
      await createConversation(formData)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
          Title *
        </label>
        <input
          type="text"
          id="title"
          name="title"
          required
          defaultValue={conversation?.title}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="medium" className="block text-sm font-medium text-gray-700 mb-1">
          Medium *
        </label>
        <select
          id="medium"
          name="medium"
          required
          defaultValue={conversation?.medium}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
        >
          {mediumOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="happenedAt" className="block text-sm font-medium text-gray-700 mb-1">
          Date & Time *
        </label>
        <input
          type="datetime-local"
          id="happenedAt"
          name="happenedAt"
          required
          defaultValue={
            conversation?.happenedAt 
              ? new Date(conversation.happenedAt).toISOString().slice(0, 16)
              : new Date().toISOString().slice(0, 16)
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="participantIds" className="block text-sm font-medium text-gray-700 mb-1">
          Participants * (hold Cmd/Ctrl to select multiple)
        </label>
        <select
          id="participantIds"
          name="participantIds"
          multiple
          required
          defaultValue={conversation?.participants.map(p => p.contactId)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 min-h-[120px]"
        >
          {contacts.map(contact => (
            <option key={contact.id} value={contact.id}>
              {contact.displayName}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="eventId" className="block text-sm font-medium text-gray-700 mb-1">
          Link to Event (optional)
        </label>
        <select
          id="eventId"
          name="eventId"
          defaultValue={conversation?.eventId || ''}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">None</option>
          {events.map(event => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          id="content"
          name="content"
          rows={4}
          defaultValue={conversation?.content || ''}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="followUpAt" className="block text-sm font-medium text-gray-700 mb-1">
          Follow-up Date (optional)
        </label>
        <input
          type="datetime-local"
          id="followUpAt"
          name="followUpAt"
          defaultValue={
            conversation?.followUpAt 
              ? new Date(conversation.followUpAt).toISOString().slice(0, 16)
              : ''
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
        >
          <FiSave className="h-5 w-5" />
          {conversation ? 'Update Conversation' : 'Create Conversation'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
        >
          <FiX className="h-5 w-5" />
        </button>
      </div>
    </form>
  )
}


