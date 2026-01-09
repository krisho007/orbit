"use client"

import { useChat, UIMessage } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useState } from "react"
import { FiSend, FiLoader, FiSquare } from "react-icons/fi"
import Link from "next/link"
import { format } from "date-fns"

// Format conversation medium for display
function formatMedium(medium: string): string {
  const mediumMap: Record<string, string> = {
    PHONE_CALL: 'Phone Call',
    WHATSAPP: 'WhatsApp',
    EMAIL: 'Email',
    CHANCE_ENCOUNTER: 'Chance Encounter',
    ONLINE_MEETING: 'Online Meeting',
    IN_PERSON_MEETING: 'In-Person Meeting',
    OTHER: 'Other'
  }
  return mediumMap[medium] || medium
}

export function AssistantChat() {
  const [input, setInput] = useState("")
  
  const welcomeMessage: UIMessage = {
    id: "welcome",
    role: "assistant",
    parts: [{ type: "text", text: "Hi! I can help you log conversations, create events, and search contacts. Try: \"I called John yesterday\" or \"Find meetings with Sarah\"" }]
  }

  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/assistant",
    }),
    messages: [welcomeMessage]
  })

  const isLoading = status === "streaming" || status === "submitted"

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    
    sendMessage({ text: input })
    setInput("")
  }

  return (
    <div className="flex-1 flex flex-col bg-white rounded-lg shadow overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] sm:max-w-[80%] rounded-lg p-3 sm:p-4 ${
              message.role === 'user' 
                ? 'bg-indigo-600 text-white' 
                : 'bg-gray-100 text-gray-900'
            }`}>
              {/* Render message parts */}
              {message.parts?.map((part, partIndex) => {
                // Text parts
                if (part.type === 'text') {
                  return (
                    <p key={partIndex} className="whitespace-pre-wrap">
                      {part.text}
                    </p>
                  )
                }

                // Tool result parts - check if it's a tool part with output available
                const isToolPart = part.type.startsWith('tool-')
                if (isToolPart && (part as any).state === 'output-available') {
                  const result = (part as any).output as any

                  if (!result || !result.type) return null

                  return (
                    <div key={partIndex} className="mt-3">
                      {result.type === 'conversation_created' && (
                        <Link
                          href={`/conversations/${result.id}`}
                          className="block p-3 bg-white text-gray-900 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <p className="font-medium">✅ Created conversation</p>
                          <p className="text-sm text-gray-600 mt-1">
                            {formatMedium(result.medium)} with {result.participants?.join(', ')}
                          </p>
                        </Link>
                      )}
                      
                      {result.type === 'conversations_found' && (
                        <div className="p-3 bg-white text-gray-900 rounded border border-gray-200">
                          <p className="font-medium mb-2">📋 Found {result.count} conversation(s):</p>
                          <ul className="space-y-1">
                            {result.conversations?.slice(0, 5).map((conv: any) => (
                              <li key={conv.id}>
                                <Link href={`/conversations/${conv.id}`} className="text-indigo-600 hover:underline">
                                  {formatMedium(conv.medium)} with {conv.participants?.join(', ')} ({format(new Date(conv.happenedAt), 'MMM d, yyyy')})
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {result.type === 'event_created' && (
                        <Link
                          href={`/events/${result.id}`}
                          className="block p-3 bg-white text-gray-900 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <p className="font-medium">✅ Created event: {result.title}</p>
                          <p className="text-sm text-gray-600 mt-1">
                            {format(new Date(result.startAt), 'PPP p')}
                          </p>
                        </Link>
                      )}
                      
                      {result.type === 'events_found' && (
                        <div className="p-3 bg-white text-gray-900 rounded border border-gray-200">
                          <p className="font-medium mb-2">📅 Found {result.count} event(s):</p>
                          <ul className="space-y-1">
                            {result.events?.slice(0, 5).map((evt: any) => (
                              <li key={evt.id}>
                                <Link href={`/events/${evt.id}`} className="text-indigo-600 hover:underline">
                                  {evt.title} ({format(new Date(evt.startAt), 'MMM d, yyyy')})
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {result.type === 'contact_created' && (
                        <Link
                          href={`/contacts/${result.id}`}
                          className="block p-3 bg-white text-gray-900 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <p className="font-medium">✅ Created contact: {result.displayName}</p>
                        </Link>
                      )}

                      {result.type === 'contact_updated' && (
                        <Link
                          href={`/contacts/${result.id}`}
                          className="block p-3 bg-white text-gray-900 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <p className="font-medium">✅ Updated contact: {result.displayName}</p>
                        </Link>
                      )}

                      {result.type === 'contacts_found' && (
                        <div className="p-3 bg-white text-gray-900 rounded border border-gray-200">
                          <p className="font-medium mb-2">👥 Found {result.count} contact(s):</p>
                          <ul className="space-y-1">
                            {result.contacts?.slice(0, 5).map((contact: any) => (
                              <li key={contact.id}>
                                <Link href={`/contacts/${contact.id}`} className="text-indigo-600 hover:underline">
                                  {contact.displayName}
                                  {contact.company && ` - ${contact.company}`}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {result.type === 'contact_details' && (
                        <div className="p-3 bg-white text-gray-900 rounded border border-gray-200">
                          <Link href={`/contacts/${result.id}`} className="font-medium text-indigo-600 hover:underline">
                            👤 {result.displayName}
                          </Link>
                          <div className="mt-2 text-sm space-y-1">
                            {result.primaryPhone && <p>📞 {result.primaryPhone}</p>}
                            {result.primaryEmail && <p>📧 {result.primaryEmail}</p>}
                            {result.company && <p>🏢 {result.company}{result.jobTitle && ` - ${result.jobTitle}`}</p>}
                            {result.location && <p>📍 {result.location}</p>}
                          </div>
                        </div>
                      )}
                      
                      {result.type === 'error' && (
                        <div className="p-3 bg-red-50 text-red-900 rounded border border-red-200">
                          <p className="text-sm">❌ {result.message}</p>
                        </div>
                      )}
                    </div>
                  )
                }

                return null
              })}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-4">
              <FiLoader className="h-5 w-5 animate-spin text-gray-600" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-gray-200 p-3 sm:p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={isLoading}
            className="flex-1 px-3 sm:px-4 py-3 min-h-[48px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 bg-white text-gray-900 placeholder-gray-500 text-base"
          />
          {isLoading ? (
            <button
              type="button"
              onClick={stop}
              className="flex items-center justify-center w-12 h-12 min-w-[48px] bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex-shrink-0"
              aria-label="Stop"
            >
              <FiSquare className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex items-center justify-center w-12 h-12 min-w-[48px] bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              aria-label="Send"
            >
              <FiSend className="h-5 w-5" />
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
