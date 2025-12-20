"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { FiPlus, FiSearch, FiMail, FiPhone, FiUser, FiBriefcase, FiMessageSquare, FiCalendar, FiDownload, FiLoader } from "react-icons/fi"
import { GoogleImportDialog } from "./google-import-dialog"

type Contact = {
  id: string
  displayName: string
  primaryEmail: string | null
  primaryPhone: string | null
  company: string | null
  jobTitle: string | null
  tags: {
    tag: {
      id: string
      name: string
      color: string | null
    }
  }[]
  images: {
    id: string
    imageUrl: string
  }[]
  _count: {
    conversationParticipants: number
    eventParticipants: number
  }
}

interface ContactsListProps {
  initialContacts: Contact[]
  initialCursor: string | null
  stats: {
    totalCount: number
    totalConversations: number
    totalEvents: number
  }
}

export function ContactsList({ initialContacts, initialCursor, stats }: ContactsListProps) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [cursor, setCursor] = useState<string | null>(initialCursor)
  const [searchQuery, setSearchQuery] = useState("")
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<Contact[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch more contacts
  const fetchMoreContacts = useCallback(async () => {
    if (!cursor || isLoading) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/contacts?cursor=${cursor}`)
      const data = await response.json()

      if (data.contacts) {
        setContacts(prev => [...prev, ...data.contacts])
        setCursor(data.nextCursor)
      }
    } catch (error) {
      console.error("Error fetching more contacts:", error)
    } finally {
      setIsLoading(false)
    }
  }, [cursor, isLoading])

  // Server-side search
  const searchContacts = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch(`/api/contacts?search=${encodeURIComponent(query)}`)
      const data = await response.json()
      setSearchResults(data.contacts || [])
    } catch (error) {
      console.error("Error searching contacts:", error)
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

    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }

    setIsSearching(true)
    searchTimeoutRef.current = setTimeout(() => {
      searchContacts(searchQuery)
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, searchContacts])

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || searchQuery) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && cursor && !isLoading) {
          fetchMoreContacts()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(loadMoreRef.current)

    return () => observer.disconnect()
  }, [cursor, isLoading, fetchMoreContacts, searchQuery])

  // Determine which contacts to display
  const displayContacts = searchQuery ? (searchResults || []) : contacts

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Contacts</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage your professional network and relationships
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setIsImportDialogOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm hover:shadow-md font-medium"
            >
              <FiDownload className="h-5 w-5" />
              Import from Google
            </button>
            <Link
              href="/contacts/new"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all shadow-sm hover:shadow-md font-medium"
            >
              <FiPlus className="h-5 w-5" />
              Add Contact
            </Link>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <FiSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Search by name, company, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent shadow-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
          {isSearching && (
            <FiLoader className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 animate-spin" />
          )}
        </div>
      </div>

      {/* Stats Summary */}
      {!searchQuery && stats.totalCount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Contacts</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.totalCount}</p>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <FiUser className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Conversations</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {stats.totalConversations}
                </p>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <FiMessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Events</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {stats.totalEvents}
                </p>
              </div>
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <FiCalendar className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contact Cards */}
      {displayContacts.length === 0 && !isSearching ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 mb-4">
            <FiUser className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">No contacts found</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            {searchQuery ? "Try adjusting your search terms to find what you're looking for." : "Get started by creating your first contact to build your network."}
          </p>
          {!searchQuery && (
            <div className="mt-6">
              <Link
                href="/contacts/new"
                className="inline-flex items-center px-5 py-2.5 border border-transparent shadow-sm font-medium rounded-lg text-white bg-purple-600 hover:bg-purple-700"
              >
                <FiPlus className="mr-2 h-5 w-5" />
                Create Contact
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayContacts.map((contact) => (
              <Link
                key={contact.id}
                href={`/contacts/${contact.id}`}
                className="group bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-lg border border-gray-100 dark:border-gray-700 p-6 card-hover"
              >
                {/* Avatar & Name */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 flex-shrink-0 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-lg shadow-md overflow-hidden">
                      {contact.images.length > 0 && contact.images[0].imageUrl ? (
                        <img
                          src={contact.images[0].imageUrl}
                          alt={contact.displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{contact.displayName.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 break-words group-hover:text-purple-600 dark:group-hover:text-purple-400">
                        {contact.displayName}
                      </h3>
                      {contact.jobTitle && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 break-words">{contact.jobTitle}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Company */}
                {contact.company && (
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-3">
                    <FiBriefcase className="mr-2 h-4 w-4 flex-shrink-0 text-gray-400" />
                    <span className="truncate">{contact.company}</span>
                  </div>
                )}

                {/* Contact Info */}
                <div className="space-y-2 mb-4">
                  {contact.primaryEmail && (
                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                      <FiMail className="mr-2 h-4 w-4 flex-shrink-0 text-gray-400" />
                      <span className="truncate">{contact.primaryEmail}</span>
                    </div>
                  )}
                  {contact.primaryPhone && (
                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                      <FiPhone className="mr-2 h-4 w-4 flex-shrink-0 text-gray-400" />
                      <span className="truncate">{contact.primaryPhone}</span>
                    </div>
                  )}
                </div>

                {/* Tags */}
                {contact.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {contact.tags.slice(0, 3).map(({ tag }) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: tag.color ? `${tag.color}15` : '#EDE9FE',
                          color: tag.color || '#7C3AED'
                        }}
                      >
                        {tag.name}
                      </span>
                    ))}
                    {contact.tags.length > 3 && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                        +{contact.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {/* Stats */}
                <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs">
                  <div className="flex items-center text-gray-500 dark:text-gray-400">
                    <FiMessageSquare className="mr-1.5 h-3.5 w-3.5" />
                    <span>{contact._count.conversationParticipants}</span>
                  </div>
                  <div className="flex items-center text-gray-500 dark:text-gray-400">
                    <FiCalendar className="mr-1.5 h-3.5 w-3.5" />
                    <span>{contact._count.eventParticipants}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Load More Trigger / Loading Indicator */}
          {!searchQuery && (
            <div ref={loadMoreRef} className="mt-8 flex justify-center">
              {isLoading && (
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <FiLoader className="h-5 w-5 animate-spin" />
                  <span>Loading more contacts...</span>
                </div>
              )}
              {!cursor && contacts.length > 0 && !isLoading && (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Showing all {contacts.length} contacts
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* Import Dialog */}
      <GoogleImportDialog
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
      />
    </div>
  )
}
