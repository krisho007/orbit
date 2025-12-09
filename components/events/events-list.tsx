"use client"

import { useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { FiPlus, FiSearch, FiCalendar, FiFilter } from "react-icons/fi"
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
  events: Event[]
}

const eventTypeLabels: Record<EventType, string> = {
  MEETING: "Meeting",
  CALL: "Call",
  BIRTHDAY: "Birthday",
  ANNIVERSARY: "Anniversary",
  CONFERENCE: "Conference",
  SOCIAL: "Social",
  OTHER: "Other"
}

export function EventsList({ events }: EventsListProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<EventType | "ALL">("ALL")

  const filteredEvents = events.filter(event => {
    const matchesSearch = 
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.participants.some(p => p.contact.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
    
    const matchesType = typeFilter === "ALL" || event.eventType === typeFilter

    return matchesSearch && matchesType
  })

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Events</h1>
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
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div className="relative">
          <FiFilter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as EventType | "ALL")}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none bg-white"
          >
            <option value="ALL">All Types</option>
            {Object.entries(eventTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <FiCalendar className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No events</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchQuery || typeFilter !== "ALL" 
              ? "No events match your filters." 
              : "Get started by creating a new event."}
          </p>
          {!searchQuery && typeFilter === "ALL" && (
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
        <div className="space-y-4">
          {filteredEvents.map((event) => (
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
                      {event.participants.map(({ contact }) => (
                        <span key={contact.id} className="text-sm text-gray-700">
                          {contact.displayName}
                        </span>
                      )).reduce((prev, curr) => <>{prev}, {curr}</>)}
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
      )}
    </div>
  )
}


