"use client"

import { useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { FiPlus, FiSearch, FiMessageSquare, FiFilter } from "react-icons/fi"
import { ConversationMedium } from "@prisma/client"

type Conversation = {
  id: string
  title: string
  content: string | null
  medium: ConversationMedium
  happenedAt: Date
  followUpAt: Date | null
  participants: {
    contact: {
      id: string
      displayName: string
    }
  }[]
  event: {
    id: string
    title: string
  } | null
}

interface ConversationsListProps {
  conversations: Conversation[]
}

const mediumLabels: Record<ConversationMedium, string> = {
  PHONE_CALL: "Phone Call",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  CHANCE_ENCOUNTER: "Chance Encounter",
  ONLINE_MEETING: "Online Meeting",
  IN_PERSON_MEETING: "In-Person Meeting",
  OTHER: "Other"
}

export function ConversationsList({ conversations }: ConversationsListProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [mediumFilter, setMediumFilter] = useState<ConversationMedium | "ALL">("ALL")

  const filteredConversations = conversations.filter(conversation => {
    const matchesSearch = 
      conversation.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conversation.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conversation.participants.some(p => p.contact.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
    
    const matchesMedium = mediumFilter === "ALL" || conversation.medium === mediumFilter

    return matchesSearch && matchesMedium
  })

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Conversations</h1>
        <Link
          href="/conversations/new"
          className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <FiPlus className="h-5 w-5" />
          Add Conversation
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div className="relative">
          <FiFilter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <select
            value={mediumFilter}
            onChange={(e) => setMediumFilter(e.target.value as ConversationMedium | "ALL")}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none bg-white"
          >
            <option value="ALL">All Mediums</option>
            {Object.entries(mediumLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredConversations.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <FiMessageSquare className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No conversations</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchQuery || mediumFilter !== "ALL" 
              ? "No conversations match your filters." 
              : "Get started by creating a new conversation."}
          </p>
          {!searchQuery && mediumFilter === "ALL" && (
            <div className="mt-6">
              <Link
                href="/conversations/new"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
              >
                <FiPlus className="mr-2 h-4 w-4" />
                New Conversation
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredConversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/conversations/${conversation.id}`}
              className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow p-5"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {conversation.title}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-indigo-100 text-indigo-800 font-medium">
                      {mediumLabels[conversation.medium]}
                    </span>
                    <span>{format(new Date(conversation.happenedAt), 'PPP')}</span>
                  </div>
                  
                  {conversation.participants.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {conversation.participants.map(({ contact }) => (
                        <span key={contact.id} className="text-sm text-gray-700">
                          {contact.displayName}
                        </span>
                      )).reduce((prev, curr) => <>{prev}, {curr}</>)}
                    </div>
                  )}

                  {conversation.event && (
                    <div className="mt-2 text-sm text-gray-500">
                      Event: {conversation.event.title}
                    </div>
                  )}

                  {conversation.content && (
                    <p className="mt-3 text-gray-700 line-clamp-2">
                      {conversation.content}
                    </p>
                  )}

                  {conversation.followUpAt && (
                    <div className="mt-3 text-sm text-orange-600 font-medium">
                      Follow-up: {format(new Date(conversation.followUpAt), 'PPP')}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}


