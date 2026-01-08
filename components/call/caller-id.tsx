"use client"

import { format, formatDistanceToNow } from "date-fns"
import Link from "next/link"
import { 
  FiPhone, 
  FiMail, 
  FiBriefcase, 
  FiMapPin, 
  FiCalendar,
  FiMessageSquare,
  FiUsers,
  FiExternalLink,
  FiClock
} from "react-icons/fi"
import type { Contact, ContactTag, Tag, ContactImage, SocialLink, Relationship, ConversationParticipant, EventParticipant, RelationshipType } from "@prisma/client"

type RelationshipWithType = Relationship & { 
  type: RelationshipType
  toContact: { id: string; displayName: string }
}

type CallerContact = Contact & {
  tags: (ContactTag & { tag: Tag })[]
  images: ContactImage[]
  socialLinks: SocialLink[]
  relationshipsFrom: RelationshipWithType[]
  conversationParticipants: (ConversationParticipant & { 
    conversation: { id: string; happenedAt: Date; medium: string; content: string | null } 
  })[]
  eventParticipants: (EventParticipant & { 
    event: { id: string; title: string; startAt: Date; eventType: string; location: string | null } 
  })[]
}

// Format conversation medium for display
function formatMedium(medium: string): string {
  const mediumMap: Record<string, string> = {
    PHONE_CALL: 'Call',
    WHATSAPP: 'WhatsApp',
    EMAIL: 'Email',
    CHANCE_ENCOUNTER: 'Met',
    ONLINE_MEETING: 'Online',
    IN_PERSON_MEETING: 'Meeting',
    OTHER: 'Other'
  }
  return mediumMap[medium] || medium
}

// Format event type for display
function formatEventType(type: string): string {
  const typeMap: Record<string, string> = {
    MEETING: 'Meeting',
    CALL: 'Call',
    BIRTHDAY: 'Birthday',
    ANNIVERSARY: 'Anniversary',
    CONFERENCE: 'Conference',
    SOCIAL: 'Social',
    FAMILY_EVENT: 'Family',
    OTHER: 'Other'
  }
  return typeMap[type] || type
}

interface CallerIdProps {
  contact: CallerContact
  phoneNumber: string
}

export function CallerId({ contact, phoneNumber }: CallerIdProps) {
  const conversations = contact.conversationParticipants.map(p => p.conversation)
  const events = contact.eventParticipants.map(p => p.event)
  const lastConversation = conversations[0]
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      {/* Header - Contact Info */}
      <div className="sticky top-0 z-10 bg-gradient-to-b from-gray-900 via-gray-900 to-transparent pb-8">
        <div className="px-4 pt-6">
          {/* Incoming Call Label */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-sm text-gray-400 uppercase tracking-wider">Incoming Call</span>
          </div>
          
          {/* Avatar & Name */}
          <div className="flex flex-col items-center text-center">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-4xl shadow-2xl border-4 border-white/20 overflow-hidden mb-4">
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
            
            <h1 className="text-3xl font-bold mb-1">{contact.displayName}</h1>
            
            {(contact.jobTitle || contact.company) && (
              <p className="text-gray-400 flex items-center gap-2">
                <FiBriefcase className="h-4 w-4" />
                {contact.jobTitle}{contact.jobTitle && contact.company && ' at '}{contact.company}
              </p>
            )}
            
            <p className="text-gray-500 mt-1">{phoneNumber}</p>
          </div>

          {/* Quick Info Pills */}
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {contact.primaryEmail && (
              <a 
                href={`mailto:${contact.primaryEmail}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-full text-sm hover:bg-white/20 transition"
              >
                <FiMail className="h-3.5 w-3.5" />
                <span className="max-w-[150px] truncate">{contact.primaryEmail}</span>
              </a>
            )}
            {contact.location && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-full text-sm">
                <FiMapPin className="h-3.5 w-3.5" />
                <span className="max-w-[150px] truncate">{contact.location}</span>
              </span>
            )}
            {contact.dateOfBirth && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-full text-sm">
                <FiCalendar className="h-3.5 w-3.5" />
                {format(new Date(contact.dateOfBirth), 'MMM d')}
              </span>
            )}
          </div>

          {/* Tags */}
          {contact.tags.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 mt-3">
              {contact.tags.map(({ tag }) => (
                <span
                  key={tag.id}
                  className="px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ 
                    backgroundColor: `${tag.color}25`,
                    color: tag.color || '#3B82F6'
                  }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          {/* Relationships */}
          {contact.relationshipsFrom.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              {contact.relationshipsFrom.slice(0, 3).map((rel) => (
                <span
                  key={rel.id}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/20 text-orange-300 rounded-full text-xs"
                >
                  <FiUsers className="h-3 w-3" />
                  {rel.type.name}: {rel.toContact.displayName}
                </span>
              ))}
            </div>
          )}

          {/* Last Contact */}
          {lastConversation && (
            <div className="mt-4 text-center">
              <p className="text-xs text-gray-500">Last talked</p>
              <p className="text-sm text-gray-300">
                {formatDistanceToNow(new Date(lastConversation.happenedAt), { addSuffix: true })}
                <span className="text-gray-500"> via {formatMedium(lastConversation.medium)}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="px-4 pb-8 space-y-6">
        {/* Notes */}
        {contact.notes && (
          <div className="bg-white/5 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Notes</h3>
            <p className="text-gray-300 text-sm whitespace-pre-wrap">{contact.notes}</p>
          </div>
        )}

        {/* Recent Conversations */}
        <div className="bg-white/5 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <FiMessageSquare className="h-4 w-4" />
              Conversations
            </h3>
            <span className="text-xs text-gray-500">{conversations.length}</span>
          </div>
          
          {conversations.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No conversations yet</p>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <Link
                  key={conv.id}
                  href={`/conversations/${conv.id}`}
                  className="block p-3 bg-white/5 rounded-xl hover:bg-white/10 transition"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                      {formatMedium(conv.medium)}
                    </span>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <FiClock className="h-3 w-3" />
                      {format(new Date(conv.happenedAt), 'MMM d, yyyy')}
                    </span>
                  </div>
                  {conv.content && (
                    <p className="text-sm text-gray-400 line-clamp-2 mt-1">{conv.content}</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Events */}
        <div className="bg-white/5 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <FiCalendar className="h-4 w-4" />
              Events
            </h3>
            <span className="text-xs text-gray-500">{events.length}</span>
          </div>
          
          {events.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No events yet</p>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="block p-3 bg-white/5 rounded-xl hover:bg-white/10 transition"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-white">{event.title}</span>
                    <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-300 rounded">
                      {formatEventType(event.eventType)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <FiClock className="h-3 w-3" />
                      {format(new Date(event.startAt), 'MMM d, yyyy')}
                    </span>
                    {event.location && (
                      <span className="flex items-center gap-1">
                        <FiMapPin className="h-3 w-3" />
                        {event.location}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* View Full Profile Link */}
        <Link
          href={`/contacts/${contact.id}`}
          className="flex items-center justify-center gap-2 w-full py-4 bg-white/10 hover:bg-white/15 rounded-2xl text-white font-medium transition"
        >
          <FiExternalLink className="h-4 w-4" />
          View Full Profile
        </Link>
      </div>
    </div>
  )
}
