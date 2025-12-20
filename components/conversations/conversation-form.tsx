"use client"

import { createConversation, updateConversation } from "@/app/(app)/conversations/actions"
import { FiSave, FiX, FiChevronDown, FiCalendar } from "react-icons/fi"
import { useRouter } from "next/navigation"
import { ConversationMedium, type Conversation } from "@prisma/client"
import { useState } from "react"
import { ParticipantInput } from "./participant-input"

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
  
  // Initialize selected participants from existing conversation
  const initialParticipants = conversation?.participants
    ? contacts.filter(c => conversation.participants.some(p => p.contactId === c.id))
    : []
  
  const [selectedParticipants, setSelectedParticipants] = useState(initialParticipants)

  const handleSubmit = async (formData: FormData) => {
    if (conversation) {
      await updateConversation(conversation.id, formData)
    } else {
      await createConversation(formData)
    }
  }

  // Format event date for display
  const formatEventDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* Participants - First field */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          Participants *
        </label>
        <ParticipantInput
          contacts={contacts}
          selectedParticipants={selectedParticipants}
          onParticipantsChange={setSelectedParticipants}
        />
      </div>

      <div>
        <label htmlFor="title" className="block text-sm font-semibold text-gray-900 mb-2">
          Title *
        </label>
        <input
          type="text"
          id="title"
          name="title"
          required
          defaultValue={conversation?.title}
          placeholder="Enter conversation title..."
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
        />
      </div>

      <div>
        <label htmlFor="medium" className="block text-sm font-semibold text-gray-900 mb-2">
          Medium *
        </label>
        <div className="relative">
          <select
            id="medium"
            name="medium"
            required
            defaultValue={conversation?.medium}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all appearance-none cursor-pointer"
          >
            {mediumOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <FiChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 pointer-events-none" />
        </div>
      </div>

      <div>
        <label htmlFor="happenedAt" className="block text-sm font-semibold text-gray-900 mb-2">
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
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
        />
      </div>

      <div>
        <label htmlFor="eventId" className="block text-sm font-semibold text-gray-900 mb-2">
          Link to Event (optional)
        </label>
        <div className="relative">
          <select
            id="eventId"
            name="eventId"
            defaultValue={conversation?.eventId || ''}
            className="w-full px-4 py-3 pl-11 border-2 border-gray-200 rounded-xl text-gray-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all appearance-none cursor-pointer"
          >
            <option value="">None</option>
            {events.map(event => (
              <option key={event.id} value={event.id}>
                {event.title} — {formatEventDate(event.startAt)}
              </option>
            ))}
          </select>
          <FiCalendar className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 pointer-events-none" />
          <FiChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 pointer-events-none" />
        </div>
      </div>

      <div>
        <label htmlFor="content" className="block text-sm font-semibold text-gray-900 mb-2">
          Notes
        </label>
        <textarea
          id="content"
          name="content"
          rows={4}
          defaultValue={conversation?.content || ''}
          placeholder="Add notes about this conversation..."
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none"
        />
      </div>

      <div>
        <label htmlFor="followUpAt" className="block text-sm font-semibold text-gray-900 mb-2">
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
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={selectedParticipants.length === 0}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FiSave className="h-5 w-5" />
          {conversation ? 'Update Conversation' : 'Create Conversation'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-3 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          <FiX className="h-5 w-5" />
        </button>
      </div>
    </form>
  )
}
