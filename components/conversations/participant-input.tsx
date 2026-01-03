"use client"

import { useState, useEffect, useRef } from "react"
import { FiX, FiUser, FiPlus } from "react-icons/fi"

type Contact = {
  id: string
  displayName: string
}

interface ParticipantInputProps {
  contacts: Contact[]
  selectedParticipants: Contact[]
  onParticipantsChange: (participants: Contact[]) => void
}

export function ParticipantInput({ contacts, selectedParticipants, onParticipantsChange }: ParticipantInputProps) {
  const [inputValue, setInputValue] = useState("")
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([])
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Filter contacts based on input and exclude already selected ones
  useEffect(() => {
    const selectedIds = selectedParticipants.map(p => p.id)
    const filtered = contacts.filter(contact => 
      !selectedIds.includes(contact.id) && 
      contact.displayName.toLowerCase().includes(inputValue.toLowerCase())
    )
    setFilteredContacts(filtered)
    setHighlightedIndex(0)
    
    if (inputValue.trim() && filtered.length > 0) {
      setShowSuggestions(true)
    } else if (!inputValue.trim()) {
      setShowSuggestions(false)
    }
  }, [inputValue, contacts, selectedParticipants])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const addParticipant = (contact: Contact) => {
    if (!selectedParticipants.find(p => p.id === contact.id)) {
      onParticipantsChange([...selectedParticipants, contact])
    }
    setInputValue("")
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const removeParticipant = (contactId: string) => {
    onParticipantsChange(selectedParticipants.filter(p => p.id !== contactId))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setShowSuggestions(false)
      setInputValue("")
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (filteredContacts.length > 0 && showSuggestions) {
        addParticipant(filteredContacts[highlightedIndex])
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      if (showSuggestions && filteredContacts.length > 0) {
        setHighlightedIndex(prev => 
          prev < filteredContacts.length - 1 ? prev + 1 : 0
        )
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (showSuggestions && filteredContacts.length > 0) {
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : filteredContacts.length - 1
        )
      }
    } else if (e.key === "Backspace" && !inputValue && selectedParticipants.length > 0) {
      removeParticipant(selectedParticipants[selectedParticipants.length - 1].id)
    }
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

  return (
    <div className="space-y-3">
      {/* Selected Participants - Capsule Style */}
      {selectedParticipants.length > 0 && (
        <div className="flex flex-wrap gap-2.5">
          {selectedParticipants.map((contact) => {
            const color = getContactColor(contact.displayName)
            return (
              <div
                key={contact.id}
                className="relative group inline-flex items-center pl-4 pr-3 py-2 rounded-full text-sm font-medium transition-all shadow-sm hover:shadow-md"
                style={{
                  backgroundColor: `${color}20`,
                  color: color,
                  border: `2px solid ${color}40`
                }}
              >
                <span className="mr-2">{contact.displayName}</span>
                <button
                  type="button"
                  onClick={() => removeParticipant(contact.id)}
                  className="flex items-center justify-center w-5 h-5 rounded-full transition-all hover:scale-110"
                  style={{
                    backgroundColor: `${color}30`,
                  }}
                >
                  <FiX className="h-3 w-3" style={{ color }} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Hidden inputs for form submission */}
      {selectedParticipants.map((contact) => (
        <input
          key={contact.id}
          type="hidden"
          name="participantIds"
          value={contact.id}
        />
      ))}

      {/* Input Field */}
      <div className="relative">
        <div className="flex items-center gap-2 px-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
          <FiUser className="h-4 w-4 text-gray-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (inputValue && filteredContacts.length > 0) {
                setShowSuggestions(true)
              }
            }}
            placeholder={selectedParticipants.length === 0 ? "Type contact name and press Enter..." : "Add more participants..."}
            className="flex-1 bg-transparent border-none outline-none text-base text-gray-900 placeholder-gray-500"
          />
          {inputValue && (
            <button
              type="button"
              onClick={() => setInputValue("")}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
            >
              <FiX className="h-4 w-4 text-gray-500" />
            </button>
          )}
        </div>

        {/* Suggestions Dropdown */}
        {showSuggestions && filteredContacts.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-10 w-full mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto"
          >
            {filteredContacts.map((contact, index) => {
              const color = getContactColor(contact.displayName)
              return (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => addParticipant(contact)}
                  className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left group ${
                    index === highlightedIndex ? 'bg-indigo-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {contact.displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="flex-1 text-base text-gray-900 font-medium">
                    {contact.displayName}
                  </span>
                  <FiPlus className="h-4 w-4 text-gray-400 group-hover:text-indigo-600" />
                </button>
              )
            })}
          </div>
        )}

        {/* No matches message */}
        {inputValue && filteredContacts.length === 0 && (
          <div className="absolute z-10 w-full mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <FiUser className="h-5 w-5 text-gray-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  No contacts found
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Try a different search term
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>💡</span>
        <span>Type to search contacts, use <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-semibold">↑</kbd> <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-semibold">↓</kbd> to navigate, <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-semibold">Enter</kbd> to select</span>
      </div>
    </div>
  )
}



