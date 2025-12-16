"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { 
  FiEdit, 
  FiTrash2, 
  FiMail, 
  FiPhone, 
  FiBriefcase, 
  FiMapPin, 
  FiCalendar,
  FiFileText,
  FiLink,
  FiImage,
  FiMessageSquare,
  FiUsers
} from "react-icons/fi"
import { deleteContact } from "@/app/(app)/contacts/actions"
import type { Contact, ContactTag, Tag, ContactImage, SocialLink, Relationship, ConversationParticipant, EventParticipant } from "@prisma/client"

type ContactWithRelations = Contact & {
  tags: (ContactTag & { tag: Tag })[]
  images: ContactImage[]
  socialLinks: SocialLink[]
  relationshipsFrom: (Relationship & { toContact: Contact })[]
  relationshipsTo: (Relationship & { fromContact: Contact })[]
  conversationParticipants: (ConversationParticipant & { 
    conversation: { id: string, title: string, happenedAt: Date, medium: string } 
  })[]
  eventParticipants: (EventParticipant & { 
    event: { id: string, title: string, startAt: Date, eventType: string } 
  })[]
}

interface ContactDetailProps {
  contact: ContactWithRelations
}

function ConversationsSection({ contact }: { contact: ContactWithRelations }) {
  const [showAll, setShowAll] = useState(false)
  const conversations = contact.conversationParticipants.map(p => p.conversation)
  const displayedConversations = showAll ? conversations : conversations.slice(0, 1)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <FiMessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Recent Conversations</h2>
        </div>
        <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm font-semibold rounded-lg">
          {conversations.length}
        </span>
      </div>
      {conversations.length === 0 ? (
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-3">
            <FiMessageSquare className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">No conversations yet</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {displayedConversations.map((conversation, index) => (
              <Link
                key={conversation.id}
                href={`/conversations/${conversation.id}`}
                className="block p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{conversation.title}</p>
                    {index === 0 && !showAll && (
                      <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded">
                        Latest
                      </span>
                    )}
                  </div>
                  <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                    {format(new Date(conversation.happenedAt), 'MMM d, yyyy')}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{conversation.medium}</p>
              </Link>
            ))}
          </div>
          {conversations.length > 1 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-4 w-full py-2.5 px-4 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
            >
              {showAll ? 'Show Less' : `Show ${conversations.length - 1} More`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function EventsSection({ contact }: { contact: ContactWithRelations }) {
  const [showAll, setShowAll] = useState(false)
  const events = contact.eventParticipants.map(p => p.event)
  const displayedEvents = showAll ? events : events.slice(0, 1)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <FiCalendar className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Events</h2>
        </div>
        <span className="px-3 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm font-semibold rounded-lg">
          {events.length}
        </span>
      </div>
      {events.length === 0 ? (
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-3">
            <FiCalendar className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">No events yet</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {displayedEvents.map((event, index) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="block p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{event.title}</p>
                    {index === 0 && !showAll && (
                      <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-medium rounded">
                        Latest
                      </span>
                    )}
                  </div>
                  <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                    {format(new Date(event.startAt), 'MMM d, yyyy')}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{event.eventType}</p>
              </Link>
            ))}
          </div>
          {events.length > 1 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-4 w-full py-2.5 px-4 text-sm font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors"
            >
              {showAll ? 'Show Less' : `Show ${events.length - 1} More`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

export function ContactDetail({ contact }: ContactDetailProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this contact? This action cannot be undone.")) {
      return
    }

    setIsDeleting(true)
    try {
      await deleteContact(contact.id)
    } catch (error) {
      console.error("Failed to delete contact:", error)
      setIsDeleting(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Card */}
      <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-xl mb-6 p-8 text-white">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="w-24 h-24 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white font-bold text-4xl shadow-lg border-4 border-white/30 overflow-hidden">
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
            
            {/* Info */}
            <div className="flex-1">
              <h1 className="text-4xl font-bold mb-2">{contact.displayName}</h1>
              {contact.jobTitle && (
                <p className="text-xl text-white/90 font-medium mb-1">{contact.jobTitle}</p>
              )}
              {contact.company && (
                <div className="flex items-center text-lg text-white/80">
                  <FiBriefcase className="mr-2 h-5 w-5" />
                  {contact.company}
                </div>
              )}
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex gap-3">
            <Link
              href={`/contacts/${contact.id}/edit`}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-purple-600 rounded-lg hover:bg-gray-50 transition-all shadow-md font-medium"
            >
              <FiEdit className="h-4 w-4" />
              Edit
            </Link>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all shadow-md disabled:opacity-50 font-medium"
            >
              <FiTrash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>

        {/* Contact Quick Info */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {contact.primaryEmail && (
            <a 
              href={`mailto:${contact.primaryEmail}`}
              className="flex items-center gap-3 p-4 bg-white/10 backdrop-blur-sm rounded-xl hover:bg-white/20 transition-all"
            >
              <div className="p-2 bg-white/20 rounded-lg">
                <FiMail className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/70 font-medium">Email</p>
                <p className="text-sm truncate">{contact.primaryEmail}</p>
              </div>
            </a>
          )}
          {contact.primaryPhone && (
            <a 
              href={`tel:${contact.primaryPhone}`}
              className="flex items-center gap-3 p-4 bg-white/10 backdrop-blur-sm rounded-xl hover:bg-white/20 transition-all"
            >
              <div className="p-2 bg-white/20 rounded-lg">
                <FiPhone className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/70 font-medium">Phone</p>
                <p className="text-sm truncate">{contact.primaryPhone}</p>
              </div>
            </a>
          )}
          {contact.location && (
            <div className="flex items-center gap-3 p-4 bg-white/10 backdrop-blur-sm rounded-xl">
              <div className="p-2 bg-white/20 rounded-lg">
                <FiMapPin className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/70 font-medium">Location</p>
                <p className="text-sm truncate">{contact.location}</p>
              </div>
            </div>
          )}
          {contact.dateOfBirth && (
            <div className="flex items-center gap-3 p-4 bg-white/10 backdrop-blur-sm rounded-xl">
              <div className="p-2 bg-white/20 rounded-lg">
                <FiCalendar className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/70 font-medium">Birthday</p>
                <p className="text-sm truncate">{format(new Date(contact.dateOfBirth), 'MMMM d, yyyy')}</p>
              </div>
            </div>
          )}
        </div>

        {/* Tags */}
        {contact.tags.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {contact.tags.map(({ tag }) => (
              <span
                key={tag.id}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-white/20 backdrop-blur-sm border border-white/30"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Notes Section */}
      {contact.notes && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <FiFileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Notes</h3>
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{contact.notes}</p>
            </div>
          </div>
        </div>
      )}

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Images */}
        {contact.images.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <FiImage className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Images</h2>
              <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">{contact.images.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {contact.images.map((image) => (
                <div key={image.id} className="aspect-square relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 shadow-sm hover:shadow-md transition-shadow">
                  <img 
                    src={image.imageUrl} 
                    alt={contact.displayName}
                    className="object-cover w-full h-full"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Social Links */}
        {contact.socialLinks.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <FiLink className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Social Links</h2>
              <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">{contact.socialLinks.length}</span>
            </div>
            <div className="space-y-2">
              {contact.socialLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all group"
                >
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg group-hover:bg-purple-100 dark:group-hover:bg-purple-900/20 transition-colors">
                    <FiLink className="h-4 w-4 text-gray-600 dark:text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
                  </div>
                  <span className="flex-1 text-gray-900 dark:text-gray-100 font-medium">{link.platform}</span>
                  <span className="text-xs text-gray-400">→</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Relationships */}
        {(contact.relationshipsFrom.length > 0 || contact.relationshipsTo.length > 0) && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                <FiUsers className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Relationships</h2>
              <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">
                {contact.relationshipsFrom.length + contact.relationshipsTo.length}
              </span>
            </div>
            <div className="space-y-2">
              {contact.relationshipsFrom.map((rel) => (
                <Link
                  key={rel.id}
                  href={`/contacts/${rel.toContact.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all group"
                >
                  <span className="text-gray-900 dark:text-gray-100 font-medium group-hover:text-purple-600 dark:group-hover:text-purple-400">
                    {rel.toContact.displayName}
                  </span>
                  <span className="text-sm px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg">
                    {rel.type}
                  </span>
                </Link>
              ))}
              {contact.relationshipsTo.map((rel) => (
                <Link
                  key={rel.id}
                  href={`/contacts/${rel.fromContact.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all group"
                >
                  <span className="text-gray-900 dark:text-gray-100 font-medium group-hover:text-purple-600 dark:group-hover:text-purple-400">
                    {rel.fromContact.displayName}
                  </span>
                  <span className="text-sm px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg">
                    {rel.type} ↔
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent Conversations */}
        <ConversationsSection contact={contact} />

        {/* Recent Events */}
        <EventsSection contact={contact} />
      </div>
    </div>
  )
}


