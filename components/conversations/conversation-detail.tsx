"use client"

import { useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { FiEdit, FiTrash2, FiCalendar, FiUsers, FiMessageSquare } from "react-icons/fi"
import { deleteConversation } from "@/app/(app)/conversations/actions"
import type { Conversation, ConversationParticipant, Contact, Event } from "@prisma/client"

type ConversationWithRelations = Conversation & {
  participants: (ConversationParticipant & { contact: Contact })[]
  event: Event | null
}

interface ConversationDetailProps {
  conversation: ConversationWithRelations
}

const mediumLabels: Record<string, string> = {
  PHONE_CALL: "Phone Call",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  CHANCE_ENCOUNTER: "Chance Encounter",
  ONLINE_MEETING: "Online Meeting",
  IN_PERSON_MEETING: "In-Person Meeting",
  OTHER: "Other"
}

export function ConversationDetail({ conversation }: ConversationDetailProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this conversation? This action cannot be undone.")) {
      return
    }

    setIsDeleting(true)
    try {
      await deleteConversation(conversation.id)
    } catch (error) {
      console.error("Failed to delete conversation:", error)
      setIsDeleting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{conversation.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 font-medium">
                {mediumLabels[conversation.medium]}
              </span>
              <div className="flex items-center text-gray-600">
                <FiCalendar className="mr-1 h-4 w-4" />
                {format(new Date(conversation.happenedAt), 'PPPp')}
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Link
              href={`/conversations/${conversation.id}/edit`}
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
        <div className="mb-6 pb-6 border-b border-gray-200">
          <div className="flex items-center mb-3">
            <FiUsers className="mr-2 h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Participants</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {conversation.participants.map(({ contact }) => (
              <Link
                key={contact.id}
                href={`/contacts/${contact.id}`}
                className="inline-flex items-center px-3 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {contact.displayName}
              </Link>
            ))}
          </div>
        </div>

        {/* Linked Event */}
        {conversation.event && (
          <div className="mb-6 pb-6 border-b border-gray-200">
            <div className="flex items-center mb-3">
              <FiCalendar className="mr-2 h-5 w-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">Linked Event</h2>
            </div>
            <Link
              href={`/events/${conversation.event.id}`}
              className="inline-flex items-center px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors"
            >
              {conversation.event.title}
            </Link>
          </div>
        )}

        {/* Content */}
        {conversation.content && (
          <div className="mb-6 pb-6 border-b border-gray-200">
            <div className="flex items-start">
              <FiMessageSquare className="mr-3 h-5 w-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Notes</h2>
                <p className="text-gray-700 whitespace-pre-wrap">{conversation.content}</p>
              </div>
            </div>
          </div>
        )}

        {/* Follow-up */}
        {conversation.followUpAt && (
          <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded">
            <div className="flex items-center">
              <FiCalendar className="mr-2 h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm font-medium text-orange-800">Follow-up scheduled</p>
                <p className="text-sm text-orange-700 mt-1">
                  {format(new Date(conversation.followUpAt), 'PPPp')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


