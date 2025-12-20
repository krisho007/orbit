"use client"

import { createEvent, updateEvent } from "@/app/(app)/events/actions"
import { FiSave, FiX, FiChevronDown } from "react-icons/fi"
import { useRouter } from "next/navigation"
import { EventType, type Event } from "@prisma/client"
import { useState } from "react"
import { EventParticipantInput } from "./participant-input"

interface EventFormProps {
  contacts: { id: string; displayName: string }[]
  event?: Event & {
    participants: { contactId: string }[]
  }
}

const eventTypeOptions: { value: EventType; label: string }[] = [
  { value: "MEETING", label: "Meeting" },
  { value: "CALL", label: "Call" },
  { value: "BIRTHDAY", label: "Birthday" },
  { value: "ANNIVERSARY", label: "Anniversary" },
  { value: "CONFERENCE", label: "Conference" },
  { value: "SOCIAL", label: "Social" },
  { value: "OTHER", label: "Other" },
]

export function EventForm({ contacts, event }: EventFormProps) {
  const router = useRouter()

  // Initialize selected participants from existing event
  const initialParticipants = event?.participants
    ? contacts.filter(c => event.participants.some(p => p.contactId === c.id))
    : []
  
  const [selectedParticipants, setSelectedParticipants] = useState(initialParticipants)

  const handleSubmit = async (formData: FormData) => {
    if (event) {
      await updateEvent(event.id, formData)
    } else {
      await createEvent(formData)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* Title - First field */}
      <div>
        <label htmlFor="title" className="block text-sm font-semibold text-gray-900 mb-2">
          Title *
        </label>
        <input
          type="text"
          id="title"
          name="title"
          required
          defaultValue={event?.title}
          placeholder="Enter event title..."
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
        />
      </div>

      {/* Participants - Second field */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          Participants
        </label>
        <EventParticipantInput
          contacts={contacts}
          selectedParticipants={selectedParticipants}
          onParticipantsChange={setSelectedParticipants}
        />
      </div>

      {/* Description/Notes - Third field */}
      <div>
        <label htmlFor="description" className="block text-sm font-semibold text-gray-900 mb-2">
          Notes
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={event?.description || ''}
          placeholder="Add notes about this event..."
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="startAt" className="block text-sm font-semibold text-gray-900 mb-2">
            Start Date & Time *
          </label>
          <input
            type="datetime-local"
            id="startAt"
            name="startAt"
            required
            defaultValue={
              event?.startAt 
                ? new Date(event.startAt).toISOString().slice(0, 16)
                : new Date().toISOString().slice(0, 16)
            }
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
          />
        </div>

        <div>
          <label htmlFor="endAt" className="block text-sm font-semibold text-gray-900 mb-2">
            End Date & Time
          </label>
          <input
            type="datetime-local"
            id="endAt"
            name="endAt"
            defaultValue={
              event?.endAt 
                ? new Date(event.endAt).toISOString().slice(0, 16)
                : ''
            }
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      <div>
        <label htmlFor="location" className="block text-sm font-semibold text-gray-900 mb-2">
          Location
        </label>
        <input
          type="text"
          id="location"
          name="location"
          defaultValue={event?.location || ''}
          placeholder="Enter location..."
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
        />
      </div>

      {/* Event Type */}
      <div>
        <label htmlFor="eventType" className="block text-sm font-semibold text-gray-900 mb-2">
          Event Type *
        </label>
        <div className="relative">
          <select
            id="eventType"
            name="eventType"
            required
            defaultValue={event?.eventType}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all appearance-none cursor-pointer"
          >
            {eventTypeOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <FiChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 pointer-events-none" />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <FiSave className="h-5 w-5" />
          {event ? 'Update Event' : 'Create Event'}
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
