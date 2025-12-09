"use client"

import { useState, useEffect, useRef } from "react"
import { FiX, FiTag, FiPlus } from "react-icons/fi"

type Tag = {
  id: string
  name: string
  color: string | null
}

interface TagInputProps {
  availableTags: Tag[]
  selectedTags: Tag[]
  onTagsChange: (tags: Tag[]) => void
}

export function TagInput({ availableTags, selectedTags, onTagsChange }: TagInputProps) {
  const [inputValue, setInputValue] = useState("")
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filteredTags, setFilteredTags] = useState<Tag[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Filter tags based on input and exclude already selected ones
  useEffect(() => {
    if (inputValue.trim()) {
      const selectedIds = selectedTags.map(t => t.id)
      const filtered = availableTags.filter(tag => 
        !selectedIds.includes(tag.id) && 
        tag.name.toLowerCase().includes(inputValue.toLowerCase())
      )
      setFilteredTags(filtered)
      setShowSuggestions(filtered.length > 0)
    } else {
      setFilteredTags([])
      setShowSuggestions(false)
    }
  }, [inputValue, availableTags, selectedTags])

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

  const addTag = (tag: Tag) => {
    if (!selectedTags.find(t => t.id === tag.id)) {
      onTagsChange([...selectedTags, tag])
    }
    setInputValue("")
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const removeTag = (tagId: string) => {
    onTagsChange(selectedTags.filter(t => t.id !== tagId))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setShowSuggestions(false)
      setInputValue("")
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (filteredTags.length > 0) {
        // Add first matching tag
        addTag(filteredTags[0])
      } else if (inputValue.trim()) {
        // Create new tag if no matches found
        createNewTag(inputValue.trim())
      }
    } else if (e.key === "Backspace" && !inputValue && selectedTags.length > 0) {
      removeTag(selectedTags[selectedTags.length - 1].id)
    }
  }

  const createNewTag = (name: string) => {
    // Check if tag already exists
    const existingTag = availableTags.find(
      tag => tag.name.toLowerCase() === name.toLowerCase()
    )
    
    if (existingTag && !selectedTags.find(t => t.id === existingTag.id)) {
      addTag(existingTag)
    } else if (!existingTag) {
      // Create temporary tag (will be created in settings later)
      const tempTag = {
        id: `temp-${Date.now()}`,
        name: name,
        color: '#7C3AED' // Default purple color
      }
      addTag(tempTag)
    }
  }

  return (
    <div className="space-y-3">
      {/* Selected Tags - Capsule Style */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2.5">
          {selectedTags.map((tag) => (
            <div
              key={tag.id}
              className="relative group inline-flex items-center pl-4 pr-3 py-2 rounded-full text-sm font-medium transition-all shadow-sm hover:shadow-md"
              style={{
                backgroundColor: tag.color ? `${tag.color}20` : '#F3E8FF',
                color: tag.color || '#7C3AED',
                border: `2px solid ${tag.color || '#7C3AED'}40`
              }}
            >
              <span className="mr-2">{tag.name}</span>
              <button
                type="button"
                onClick={() => removeTag(tag.id)}
                className="flex items-center justify-center w-5 h-5 rounded-full transition-all hover:scale-110"
                style={{
                  backgroundColor: tag.color ? `${tag.color}30` : '#DDD6FE',
                }}
              >
                <FiX className="h-3 w-3" style={{ color: tag.color || '#7C3AED' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Field */}
      <div className="relative">
        <div className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus-within:ring-2 focus-within:ring-purple-500 focus-within:border-purple-500 transition-all">
          <FiTag className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (inputValue && filteredTags.length > 0) {
                setShowSuggestions(true)
              }
            }}
            placeholder={selectedTags.length === 0 ? "Type tag name and press Enter to add..." : "Add more tags..."}
            className="flex-1 bg-transparent border-none outline-none text-base text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
          {inputValue && (
            <button
              type="button"
              onClick={() => setInputValue("")}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <FiX className="h-4 w-4 text-gray-400" />
            </button>
          )}
        </div>

        {/* Suggestions Dropdown */}
        {showSuggestions && filteredTags.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-60 overflow-y-auto"
          >
            {filteredTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => addTag(tag)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left group"
              >
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color || '#7C3AED' }}
                />
                <span className="flex-1 text-base text-gray-900 dark:text-gray-100 font-medium">
                  {tag.name}
                </span>
                <FiPlus className="h-4 w-4 text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
              </button>
            ))}
          </div>
        )}

        {/* Create new tag prompt */}
        {inputValue && filteredTags.length === 0 && (
          <div className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <FiPlus className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-semibold">Enter</kbd> to create
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  New tag: <span className="font-semibold text-purple-600 dark:text-purple-400">"{inputValue}"</span>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>💡</span>
        <span>Type tag name and press <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs font-semibold">Enter</kbd> to add multiple tags</span>
      </div>
    </div>
  )
}

