"use client"

import { useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { FiEdit, FiTrash2, FiCalendar, FiUsers, FiMapPin, FiFileText, FiMessageSquare } from "react-icons/fi"
import { deleteEvent } from "@/app/(app)/events/actions"
import type { Event, EventParticipant, Contact, Conversation, ConversationParticipant } from "@prisma/client"

type EventWithRelations = Event & {
  participants: (EventParticipant & { contact: Contact })[]
  conversations: (Conversation & {
    participants: (ConversationParticipant & { contact: Contact })[]
  })[]
}

interface EventDetailProps {
  event: EventWithRelations
}

const eventTypeLabels: Record<string, string> = {
  MEETING: "Meeting",
  CALL: "Call",
  BIRTHDAY: "Birthday",
  ANNIVERSARY: "Anniversary",
  CONFERENCE: "Conference",
  SOCIAL: "Social",
  OTHER: "Other"
}

// Generate a consistent color based on contact name
const getContactColor = (name: string) => {
  const colors = [
    '#8B5CF6', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', 
    '#EF4444', '#06B6D4', '#6366F1', '#84CC16', '#F97316'
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

export function EventDetail({ event }: EventDetailProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this event? This action cannot be undone.")) {
      return
    }

    setIsDeleting(true)
    try {
      await deleteEvent(event.id)
    } catch (error) {
      console.error("Failed to delete event:", error)
      setIsDeleting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{event.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">
                {eventTypeLabels[event.eventType]}
              </span>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Link
              href={`/events/${event.id}/edit`}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <FiEdit className="h-4 w-4" />
              Edit
            </Link>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <FiTrash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>

        {/* Participants */}
        {event.participants.length > 0 && (
          <div className="mb-6 pb-6 border-b border-gray-200">
            <div className="flex items-center mb-3">
              <FiUsers className="mr-2 h-5 w-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">Participants</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {event.participants.map(({ contact }) => {
                const color = getContactColor(contact.displayName)
                return (
                  <Link
                    key={contact.id}
                    href={`/contacts/${contact.id}`}
                    className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium transition-all hover:shadow-md"
                    style={{
                      backgroundColor: `${color}20`,
                      color: color,
                      border: `2px solid ${color}40`
                    }}
                  >
                    {contact.displayName}
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Description/Notes */}
        {event.description && (
          <div className="mb-6 pb-6 border-b border-gray-200">
            <div className="flex items-start">
              <FiFileText className="mr-3 h-5 w-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Notes</h2>
                <p className="text-gray-700 whitespace-pre-wrap">{event.description}</p>
              </div>
            </div>
          </div>
        )}

        {/* Date & Time */}
        <div className="mb-6 pb-6 border-b border-gray-200">
          <div className="flex items-start">
            <FiCalendar className="mr-3 h-5 w-5 text-gray-400 mt-0.5" />
            <div>
              <p className="text-gray-900 font-medium">
                {format(new Date(event.startAt), 'PPPp')}
              </p>
              {event.endAt && (
                <p className="text-gray-600 mt-1">
                  Ends: {format(new Date(event.endAt), 'PPPp')}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Location */}
        {event.location && (
          <div className="mb-6 pb-6 border-b border-gray-200">
            <div className="flex items-start">
              <FiMapPin className="mr-3 h-5 w-5 text-gray-400 mt-0.5" />
              <p className="text-gray-900">{event.location}</p>
            </div>
          </div>
        )}

        {/* Linked Conversations */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <FiMessageSquare className="mr-2 h-5 w-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">Linked Conversations</h2>
            </div>
            <span className="text-sm text-gray-500">{event.conversations.length}</span>
          </div>
          
          {event.conversations.length === 0 ? (
            <p className="text-sm text-gray-500">No conversations linked to this event yet.</p>
          ) : (
            <div className="space-y-3">
              {event.conversations.map((conversation) => {
                const conversationParticipants = conversation.participants.map(p => p.contact.displayName).join(", ")
                return (
                  <Link
                    key={conversation.id}
                    href={`/conversations/${conversation.id}`}
                    className="block p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{conversationParticipants || "Conversation"}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          {format(new Date(conversation.happenedAt), 'PPP')}
                        </p>
                        {conversation.content && (
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                            {conversation.content}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
