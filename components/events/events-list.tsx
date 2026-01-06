"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { FiPlus, FiSearch, FiCalendar, FiFilter, FiLoader } from "react-icons/fi"
import { EventType } from "@prisma/client"

type Event = {
  id: string
  title: string
  description: string | null
  eventType: EventType
  startAt: Date
  endAt: Date | null
  location: string | null
  participants: {
    contact: {
      id: string
      displayName: string
    }
  }[]
  _count: {
    conversations: number
  }
}

interface EventsListProps {
  initialEvents: Event[]
  initialCursor: string | null
  totalCount: number
}

const eventTypeLabels: Record<EventType, string> = {
  MEETING: "Meeting",
  CALL: "Call",
  BIRTHDAY: "Birthday",
  ANNIVERSARY: "Anniversary",
  CONFERENCE: "Conference",
  SOCIAL: "Social",
  FAMILY_EVENT: "Family Event",
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

export function EventsList({ initialEvents, initialCursor, totalCount }: EventsListProps) {
  const [events, setEvents] = useState<Event[]>(initialEvents)
  const [cursor, setCursor] = useState<string | null>(initialCursor)
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<EventType | "ALL">("ALL")
  const [isLoading, setIsLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<Event[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch more events
  const fetchMoreEvents = useCallback(async () => {
    if (!cursor || isLoading) return

    setIsLoading(true)
    try {
      let url = `/api/events?cursor=${cursor}`
      if (typeFilter !== "ALL") {
        url += `&eventType=${typeFilter}`
      }
      const response = await fetch(url)
      const data = await response.json()

      if (data.events) {
        setEvents(prev => [...prev, ...data.events])
        setCursor(data.nextCursor)
      }
    } catch (error) {
      console.error("Error fetching more events:", error)
    } finally {
      setIsLoading(false)
    }
  }, [cursor, isLoading, typeFilter])

  // Server-side search/filter
  const searchEvents = useCallback(async (query: string, eventType: EventType | "ALL") => {
    if (!query.trim() && eventType === "ALL") {
      setSearchResults(null)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    try {
      let url = `/api/events?`
      if (query.trim()) {
        url += `search=${encodeURIComponent(query)}&`
      }
      if (eventType !== "ALL") {
        url += `eventType=${eventType}`
      }
      const response = await fetch(url)
      const data = await response.json()
      setSearchResults(data.events || [])
    } catch (error) {
      console.error("Error searching events:", error)
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

    if (!searchQuery.trim() && typeFilter === "ALL") {
      setSearchResults(null)
      return
    }

    setIsSearching(true)
    searchTimeoutRef.current = setTimeout(() => {
      searchEvents(searchQuery, typeFilter)
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, typeFilter, searchEvents])

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || searchQuery || typeFilter !== "ALL") return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && cursor && !isLoading) {
          fetchMoreEvents()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(loadMoreRef.current)

    return () => observer.disconnect()
  }, [cursor, isLoading, fetchMoreEvents, searchQuery, typeFilter])

  // Determine which events to display
  const displayEvents = (searchQuery || typeFilter !== "ALL") ? (searchResults || []) : events
  const isFiltering = searchQuery || typeFilter !== "ALL"

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Events</h1>
          {!isFiltering && totalCount > 0 && (
            <p className="text-sm text-gray-500 mt-1">{totalCount} total events</p>
          )}
        </div>
        <Link
          href="/events/new"
          className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <FiPlus className="h-5 w-5" />
          Add Event
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 placeholder-gray-500"
          />
          {isSearching && (
            <FiLoader className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 animate-spin" />
          )}
        </div>

        <div className="relative">
          <FiFilter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as EventType | "ALL")}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none bg-white text-gray-900"
          >
            <option value="ALL">All Types</option>
            {Object.entries(eventTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {displayEvents.length === 0 && !isSearching ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <FiCalendar className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No events</h3>
          <p className="mt-1 text-sm text-gray-500">
            {isFiltering
              ? "No events match your filters."
              : "Get started by creating a new event."}
          </p>
          {!isFiltering && (
            <div className="mt-6">
              <Link
                href="/events/new"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
              >
                <FiPlus className="mr-2 h-4 w-4" />
                New Event
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {displayEvents.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {event.title}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                      <span className="inline-flex items-center px-2 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">
                        {eventTypeLabels[event.eventType]}
                      </span>
                      <span>{format(new Date(event.startAt), 'PPP p')}</span>
                      {event.endAt && (
                        <span>- {format(new Date(event.endAt), 'p')}</span>
                      )}
                    </div>

                    {event.location && (
                      <div className="mt-2 text-sm text-gray-600">
                        📍 {event.location}
                      </div>
                    )}

                    {event.participants.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {event.participants.map(({ contact }) => {
                          const color = getContactColor(contact.displayName)
                          return (
                            <span 
                              key={contact.id} 
                              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
                              style={{
                                backgroundColor: `${color}20`,
                                color: color,
                              }}
                            >
                              {contact.displayName}
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {event.description && (
                      <p className="mt-3 text-gray-700 line-clamp-2">
                        {event.description}
                      </p>
                    )}

                    <div className="mt-3 text-sm text-gray-500">
                      {event._count.conversations} linked conversation{event._count.conversations !== 1 ? 's' : ''}
                    </div>
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
                  <span>Loading more events...</span>
                </div>
              )}
              {!cursor && events.length > 0 && !isLoading && (
                <p className="text-sm text-gray-400">
                  Showing all {events.length} events
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
