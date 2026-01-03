"use client"

import { useState, useEffect } from "react"
import { FiX, FiSearch, FiUsers, FiArrowRight } from "react-icons/fi"
import type { Gender } from "@prisma/client"

type Contact = {
  id: string
  displayName: string
  gender: Gender | null
}

type RelationshipType = {
  id: string
  name: string
  isSymmetric: boolean
  reverseTypeId: string | null
  maleReverseTypeId: string | null
  femaleReverseTypeId: string | null
  reverseType: { id: string; name: string } | null
  maleReverseType: { id: string; name: string } | null
  femaleReverseType: { id: string; name: string } | null
}

interface AddRelationshipDialogProps {
  isOpen: boolean
  onClose: () => void
  currentContact: Contact
  contacts: Contact[]
  relationshipTypes: RelationshipType[]
  onSubmit: (toContactId: string, typeId: string, targetGender?: Gender) => Promise<void>
}

export function AddRelationshipDialog({
  isOpen,
  onClose,
  currentContact,
  contacts,
  relationshipTypes,
  onSubmit
}: AddRelationshipDialogProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [selectedTypeId, setSelectedTypeId] = useState<string>("")
  const [targetGender, setTargetGender] = useState<Gender | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("")
      setSelectedContact(null)
      setSelectedTypeId("")
      setTargetGender(null)
    }
  }, [isOpen])

  // Update target gender when contact is selected
  useEffect(() => {
    if (selectedContact) {
      setTargetGender(selectedContact.gender)
    }
  }, [selectedContact])

  if (!isOpen) return null

  // Filter contacts (exclude current contact)
  const filteredContacts = contacts
    .filter(c => c.id !== currentContact.id)
    .filter(c => 
      c.displayName.toLowerCase().includes(searchQuery.toLowerCase())
    )

  // Get selected type
  const selectedType = relationshipTypes.find(t => t.id === selectedTypeId)

  // Check if gender is required for the selected type
  const needsGender = selectedType && !selectedType.isSymmetric && 
    (selectedType.maleReverseTypeId || selectedType.femaleReverseTypeId) &&
    !targetGender

  // Get reverse type name for preview
  const getReverseTypeName = () => {
    if (!selectedType) return null
    if (selectedType.isSymmetric) return selectedType.name
    
    if (targetGender === 'MALE' && selectedType.maleReverseType) {
      return selectedType.maleReverseType.name
    }
    if (targetGender === 'FEMALE' && selectedType.femaleReverseType) {
      return selectedType.femaleReverseType.name
    }
    if (selectedType.reverseType) {
      return selectedType.reverseType.name
    }
    return null
  }

  const reverseTypeName = getReverseTypeName()

  const handleSubmit = async () => {
    if (!selectedContact || !selectedTypeId) return
    
    // If gender is required but not set, don't submit
    if (needsGender) return

    setIsSubmitting(true)
    try {
      await onSubmit(selectedContact.id, selectedTypeId, targetGender || undefined)
      onClose()
    } catch (error) {
      console.error("Failed to create relationship:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <FiUsers className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Add Relationship</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Contact Search */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Select Contact
            </label>
            {selectedContact ? (
              <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-800 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-200 dark:bg-orange-800 flex items-center justify-center text-orange-700 dark:text-orange-300 font-semibold">
                    {selectedContact.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{selectedContact.displayName}</p>
                    {selectedContact.gender && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {selectedContact.gender === 'MALE' ? '♂ Male' : '♀ Female'}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedContact(null)}
                  className="text-sm text-orange-600 dark:text-orange-400 hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search contacts..."
                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto border-2 border-gray-200 dark:border-gray-600 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
                  {filteredContacts.length === 0 ? (
                    <p className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                      No contacts found
                    </p>
                  ) : (
                    filteredContacts.map(contact => (
                      <button
                        key={contact.id}
                        onClick={() => setSelectedContact(contact)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 font-medium text-sm">
                          {contact.displayName.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-gray-900 dark:text-gray-100">{contact.displayName}</span>
                        {contact.gender && (
                          <span className="text-xs text-gray-400">
                            {contact.gender === 'MALE' ? '♂' : '♀'}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Relationship Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Relationship Type
            </label>
            <select
              value={selectedTypeId}
              onChange={(e) => setSelectedTypeId(e.target.value)}
              className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 dark:text-gray-100"
            >
              <option value="">Select relationship type...</option>
              {relationshipTypes.map(type => (
                <option key={type.id} value={type.id}>
                  {type.name} {type.isSymmetric ? '(symmetric)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Gender Toggle - shown when needed */}
          {selectedContact && selectedType && needsGender && (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-3">
                Please set {selectedContact.displayName}&apos;s gender to determine the reverse relationship
              </p>
              <div className="flex rounded-xl border-2 border-amber-300 dark:border-amber-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setTargetGender('MALE')}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium transition-all ${
                    targetGender === 'MALE'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  ♂ Male
                </button>
                <button
                  type="button"
                  onClick={() => setTargetGender('FEMALE')}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium transition-all border-l-2 border-amber-300 dark:border-amber-700 ${
                    targetGender === 'FEMALE'
                      ? 'bg-pink-500 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  ♀ Female
                </button>
              </div>
            </div>
          )}

          {/* Preview */}
          {selectedContact && selectedType && !needsGender && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Relationship Preview:</p>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{currentContact.displayName}</span>
                <FiArrowRight className="text-gray-400" />
                <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded font-medium">
                  {selectedType.name}
                </span>
                <FiArrowRight className="text-gray-400" />
                <span className="font-semibold text-gray-900 dark:text-gray-100">{selectedContact.displayName}</span>
              </div>
              {reverseTypeName && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{selectedContact.displayName}</span>
                  <FiArrowRight className="text-gray-400" />
                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded font-medium">
                    {reverseTypeName}
                  </span>
                  <FiArrowRight className="text-gray-400" />
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{currentContact.displayName}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedContact || !selectedTypeId || needsGender || isSubmitting}
            className="flex-1 px-4 py-3 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Creating...' : 'Create Relationship'}
          </button>
        </div>
      </div>
    </div>
  )
}



