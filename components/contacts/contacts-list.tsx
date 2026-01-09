"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { FiPlus, FiSearch, FiMail, FiPhone, FiUser, FiBriefcase, FiMessageSquare, FiCalendar, FiDownload, FiLoader, FiChevronDown, FiChevronUp } from "react-icons/fi"
import { FaWhatsapp } from "react-icons/fa"
import { GoogleImportDialog } from "./google-import-dialog"

function sanitizePhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '')
}

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
  const [expandedContacts, setExpandedContacts] = useState<Set<string>>(new Set())
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const toggleExpanded = (contactId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setExpandedContacts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(contactId)) {
        newSet.delete(contactId)
      } else {
        newSet.add(contactId)
      }
      return newSet
    })
  }

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Contacts</h1>
            <p className="hidden sm:block mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage your professional network and relationships
            </p>
          </div>
          <div className="flex gap-2 sm:gap-3">
            <button
              onClick={() => setIsImportDialogOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 sm:gap-2 p-2.5 sm:px-5 sm:py-2.5 min-w-[44px] min-h-[44px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm hover:shadow-md font-medium text-sm sm:text-base"
              aria-label="Import from Google"
            >
              <FiDownload className="h-5 w-5" />
              <span className="hidden sm:inline">Import from Google</span>
            </button>
            <Link
              href="/contacts/new"
              className="inline-flex items-center justify-center gap-1.5 sm:gap-2 p-2.5 sm:px-5 sm:py-2.5 min-w-[44px] min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all shadow-sm hover:shadow-md font-medium text-sm sm:text-base"
              aria-label="Add Contact"
            >
              <FiPlus className="h-5 w-5" />
              <span className="hidden sm:inline">Add Contact</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-4 sm:mb-6">
        <div className="relative">
          <FiSearch className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 sm:h-5 sm:w-5" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 sm:pl-12 pr-4 py-3 min-h-[44px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent shadow-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 text-sm sm:text-base"
          />
          {isSearching && (
            <FiLoader className="absolute right-3 sm:right-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
          )}
        </div>
      </div>

      {/* Stats Summary - Compact on mobile */}
      {!searchQuery && stats.totalCount > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 sm:p-5">
            <div className="flex items-center sm:justify-between gap-2 sm:gap-0">
              <div className="hidden sm:block p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <FiUser className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="text-center sm:text-left flex-1 sm:flex-none">
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalCount}</p>
                <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Contacts</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 sm:p-5">
            <div className="flex items-center sm:justify-between gap-2 sm:gap-0">
              <div className="hidden sm:block p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <FiMessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-center sm:text-left flex-1 sm:flex-none">
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalConversations}</p>
                <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Chats</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 sm:p-5">
            <div className="flex items-center sm:justify-between gap-2 sm:gap-0">
              <div className="hidden sm:block p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <FiCalendar className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-center sm:text-left flex-1 sm:flex-none">
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalEvents}</p>
                <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Events</p>
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
          <div className="flex flex-col gap-2">
            {displayContacts.map((contact) => {
              const isExpanded = expandedContacts.has(contact.id)
              return (
                <div
                  key={contact.id}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
                >
                  {/* Compact Row */}
                  <div className="flex items-center gap-3 p-3">
                    {/* Avatar */}
                    <Link href={`/contacts/${contact.id}`} className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-sm shadow-sm overflow-hidden hover:ring-2 hover:ring-purple-400 transition-all">
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
                    </Link>

                    {/* Name & Company */}
                    <Link href={`/contacts/${contact.id}`} className="flex-1 min-w-0 hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {contact.displayName}
                      </h3>
                      {contact.company && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{contact.company}</p>
                      )}
                    </Link>

                    {/* Quick Action Buttons - Call & WhatsApp */}
                    {contact.primaryPhone && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <a
                          href={`tel:${contact.primaryPhone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-center w-10 h-10 sm:w-9 sm:h-9 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors shadow-sm"
                          aria-label={`Call ${contact.displayName}`}
                        >
                          <FiPhone className="h-4 w-4" />
                        </a>
                        <a
                          href={`https://wa.me/${sanitizePhoneNumber(contact.primaryPhone)}`}
                          onClick={(e) => e.stopPropagation()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-10 h-10 sm:w-9 sm:h-9 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors shadow-sm"
                          aria-label={`WhatsApp ${contact.displayName}`}
                        >
                          <FaWhatsapp className="h-4 w-4" />
                        </a>
                      </div>
                    )}

                    {/* Quick Stats */}
                    <div className="hidden sm:flex items-center gap-3 text-xs text-gray-400">
                      {contact._count.conversationParticipants > 0 && (
                        <div className="flex items-center gap-1">
                          <FiMessageSquare className="h-3.5 w-3.5" />
                          <span>{contact._count.conversationParticipants}</span>
                        </div>
                      )}
                      {contact._count.eventParticipants > 0 && (
                        <div className="flex items-center gap-1">
                          <FiCalendar className="h-3.5 w-3.5" />
                          <span>{contact._count.eventParticipants}</span>
                        </div>
                      )}
                    </div>

                    {/* Tags Preview (compact) */}
                    {contact.tags.length > 0 && (
                      <div className="hidden md:flex items-center gap-1">
                        {contact.tags.slice(0, 2).map(({ tag }) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: tag.color ? `${tag.color}15` : '#EDE9FE',
                              color: tag.color || '#7C3AED'
                            }}
                          >
                            {tag.name}
                          </span>
                        ))}
                        {contact.tags.length > 2 && (
                          <span className="text-xs text-gray-400">+{contact.tags.length - 2}</span>
                        )}
                      </div>
                    )}

                    {/* Expand Button */}
                    <button
                      onClick={(e) => toggleExpanded(contact.id, e)}
                      className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                      aria-label={isExpanded ? "Collapse details" : "Expand details"}
                    >
                      {isExpanded ? (
                        <FiChevronUp className="h-4 w-4" />
                      ) : (
                        <FiChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-0 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <div className="pt-3 space-y-2">
                        {/* Job Title */}
                        {contact.jobTitle && (
                          <p className="text-xs text-gray-600 dark:text-gray-400">{contact.jobTitle}</p>
                        )}
                        
                        {/* Contact Info */}
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

                        {/* All Tags (mobile) */}
                        {contact.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {contact.tags.map(({ tag }) => (
                              <span
                                key={tag.id}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                                style={{
                                  backgroundColor: tag.color ? `${tag.color}15` : '#EDE9FE',
                                  color: tag.color || '#7C3AED'
                                }}
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Stats (mobile) */}
                        <div className="flex items-center gap-4 pt-2 text-xs text-gray-500 dark:text-gray-400 sm:hidden">
                          <div className="flex items-center gap-1">
                            <FiMessageSquare className="h-3.5 w-3.5" />
                            <span>{contact._count.conversationParticipants} conversations</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <FiCalendar className="h-3.5 w-3.5" />
                            <span>{contact._count.eventParticipants} events</span>
                          </div>
                        </div>

                        {/* View Profile Link */}
                        <div className="pt-2">
                          <Link
                            href={`/contacts/${contact.id}`}
                            className="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium"
                          >
                            View full profile →
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
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
