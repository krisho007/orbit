"use client"

import { useState, useRef, useEffect } from "react"
import { FiSend, FiLoader } from "react-icons/fi"
import Link from "next/link"
import { format } from "date-fns"

type Message = {
  role: "user" | "assistant"
  content: string
  actions?: any[]
}

export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I'm your Orbit assistant. I can help you log conversations, create events, and search your data. Try saying something like 'I had a call with John yesterday' or 'What meetings do I have with Sarah?'"
    }
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = { role: "user", content: input }
    setMessages(prev => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      })

      if (!response.ok) {
        throw new Error("Failed to get response")
      }

      const data = await response.json()
      
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.message || "Done!",
        actions: data.actions
      }])
    } catch (error) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again."
      }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-white rounded-lg shadow overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg p-4 ${
              message.role === 'user' 
                ? 'bg-indigo-600 text-white' 
                : 'bg-gray-100 text-gray-900'
            }`}>
              <p className="whitespace-pre-wrap">{message.content}</p>
              
              {/* Render actions */}
              {message.actions && message.actions.length > 0 && (
                <div className="mt-4 space-y-2">
                  {message.actions.map((action, i) => (
                    <div key={i}>
                      {action.type === 'conversation_created' && (
                        <Link
                          href={`/conversations/${action.data.id}`}
                          className="block p-3 bg-white text-gray-900 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <p className="font-medium">✅ Created conversation: {action.data.title}</p>
                          <p className="text-sm text-gray-600 mt-1">
                            With: {action.data.participants.map((p: any) => p.contact.displayName).join(', ')}
                          </p>
                        </Link>
                      )}
                      
                      {action.type === 'conversations_found' && (
                        <div className="p-3 bg-white text-gray-900 rounded border border-gray-200">
                          <p className="font-medium mb-2">📋 Found {action.data.length} conversation(s):</p>
                          <ul className="space-y-1">
                            {action.data.slice(0, 5).map((conv: any) => (
                              <li key={conv.id}>
                                <Link href={`/conversations/${conv.id}`} className="text-indigo-600 hover:underline">
                                  {conv.title} ({format(new Date(conv.happenedAt), 'MMM d, yyyy')})
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {action.type === 'event_created' && (
                        <Link
                          href={`/events/${action.data.id}`}
                          className="block p-3 bg-white text-gray-900 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <p className="font-medium">✅ Created event: {action.data.title}</p>
                          <p className="text-sm text-gray-600 mt-1">
                            {format(new Date(action.data.startAt), 'PPP p')}
                          </p>
                        </Link>
                      )}
                      
                      {action.type === 'events_found' && (
                        <div className="p-3 bg-white text-gray-900 rounded border border-gray-200">
                          <p className="font-medium mb-2">📅 Found {action.data.length} event(s):</p>
                          <ul className="space-y-1">
                            {action.data.slice(0, 5).map((evt: any) => (
                              <li key={evt.id}>
                                <Link href={`/events/${evt.id}`} className="text-indigo-600 hover:underline">
                                  {evt.title} ({format(new Date(evt.startAt), 'MMM d, yyyy')})
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {action.type === 'error' && (
                        <div className="p-3 bg-red-50 text-red-900 rounded border border-red-200">
                          <p className="text-sm">❌ {action.message}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiSend className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  )
}


