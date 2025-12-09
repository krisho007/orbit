"use client"

import { createEvent, updateEvent } from "@/app/(app)/events/actions"
import { FiSave, FiX } from "react-icons/fi"
import { useRouter } from "next/navigation"
import { EventType, type Event } from "@prisma/client"

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

  const handleSubmit = async (formData: FormData) => {
    if (event) {
      await updateEvent(event.id, formData)
    } else {
      await createEvent(formData)
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
          defaultValue={event?.title}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="eventType" className="block text-sm font-medium text-gray-700 mb-1">
          Event Type *
        </label>
        <select
          id="eventType"
          name="eventType"
          required
          defaultValue={event?.eventType}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
        >
          {eventTypeOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="startAt" className="block text-sm font-medium text-gray-700 mb-1">
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="endAt" className="block text-sm font-medium text-gray-700 mb-1">
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      <div>
        <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
          Location
        </label>
        <input
          type="text"
          id="location"
          name="location"
          defaultValue={event?.location || ''}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="participantIds" className="block text-sm font-medium text-gray-700 mb-1">
          Participants (hold Cmd/Ctrl to select multiple)
        </label>
        <select
          id="participantIds"
          name="participantIds"
          multiple
          defaultValue={event?.participants.map(p => p.contactId)}
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
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={event?.description || ''}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
        >
          <FiSave className="h-5 w-5" />
          {event ? 'Update Event' : 'Create Event'}
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


