"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { FiPlus, FiSearch, FiMessageSquare, FiFilter, FiLoader } from "react-icons/fi"
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
  initialConversations: Conversation[]
  initialCursor: string | null
  totalCount: number
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

export function ConversationsList({ initialConversations, initialCursor, totalCount }: ConversationsListProps) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations)
  const [cursor, setCursor] = useState<string | null>(initialCursor)
  const [searchQuery, setSearchQuery] = useState("")
  const [mediumFilter, setMediumFilter] = useState<ConversationMedium | "ALL">("ALL")
  const [isLoading, setIsLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<Conversation[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch more conversations
  const fetchMoreConversations = useCallback(async () => {
    if (!cursor || isLoading) return

    setIsLoading(true)
    try {
      let url = `/api/conversations?cursor=${cursor}`
      if (mediumFilter !== "ALL") {
        url += `&medium=${mediumFilter}`
      }
      const response = await fetch(url)
      const data = await response.json()

      if (data.conversations) {
        setConversations(prev => [...prev, ...data.conversations])
        setCursor(data.nextCursor)
      }
    } catch (error) {
      console.error("Error fetching more conversations:", error)
    } finally {
      setIsLoading(false)
    }
  }, [cursor, isLoading, mediumFilter])

  // Server-side search/filter
  const searchConversations = useCallback(async (query: string, medium: ConversationMedium | "ALL") => {
    if (!query.trim() && medium === "ALL") {
      setSearchResults(null)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    try {
      let url = `/api/conversations?`
      if (query.trim()) {
        url += `search=${encodeURIComponent(query)}&`
      }
      if (medium !== "ALL") {
        url += `medium=${medium}`
      }
      const response = await fetch(url)
      const data = await response.json()
      setSearchResults(data.conversations || [])
    } catch (error) {
      console.error("Error searching conversations:", error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (!searchQuery.trim() && mediumFilter === "ALL") {
      setSearchResults(null)
      return
    }

    setIsSearching(true)
    searchTimeoutRef.current = setTimeout(() => {
      searchConversations(searchQuery, mediumFilter)
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, mediumFilter, searchConversations])

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || searchQuery || mediumFilter !== "ALL") return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && cursor && !isLoading) {
          fetchMoreConversations()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(loadMoreRef.current)

    return () => observer.disconnect()
  }, [cursor, isLoading, fetchMoreConversations, searchQuery, mediumFilter])

  // Determine which conversations to display
  const displayConversations = (searchQuery || mediumFilter !== "ALL") ? (searchResults || []) : conversations
  const isFiltering = searchQuery || mediumFilter !== "ALL"

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Conversations</h1>
          {!isFiltering && totalCount > 0 && (
            <p className="text-sm text-gray-500 mt-1">{totalCount} total conversations</p>
          )}
        </div>
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
          {isSearching && (
            <FiLoader className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 animate-spin" />
          )}
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

      {displayConversations.length === 0 && !isSearching ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <FiMessageSquare className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No conversations</h3>
          <p className="mt-1 text-sm text-gray-500">
            {isFiltering
              ? "No conversations match your filters."
              : "Get started by creating a new conversation."}
          </p>
          {!isFiltering && (
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
        <>
          <div className="space-y-4">
            {displayConversations.map((conversation) => (
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

          {/* Load More Trigger / Loading Indicator */}
          {!isFiltering && (
            <div ref={loadMoreRef} className="mt-8 flex justify-center">
              {isLoading && (
                <div className="flex items-center gap-2 text-gray-500">
                  <FiLoader className="h-5 w-5 animate-spin" />
                  <span>Loading more conversations...</span>
                </div>
              )}
              {!cursor && conversations.length > 0 && !isLoading && (
                <p className="text-sm text-gray-400">
                  Showing all {conversations.length} conversations
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
