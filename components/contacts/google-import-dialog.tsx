"use client"

import { useState } from "react"
import { FiDownload, FiX, FiCheckCircle, FiAlertCircle } from "react-icons/fi"
import { importGoogleContactsBatch, revalidateContactsAfterImport } from "@/app/(app)/contacts/actions"

interface GoogleImportDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function GoogleImportDialog({ isOpen, onClose }: GoogleImportDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<"select" | "preview" | "importing" | "complete">("select")
  const [contacts, setContacts] = useState<any[]>([])
  const [selectedContacts, setSelectedContacts] = useState<Set<number>>(new Set())
  const [overrideExisting, setOverrideExisting] = useState(false)
  const [result, setResult] = useState<{ imported: number; updated: number; skipped: number; errors: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 })

  if (!isOpen) return null

  const handleFetchContacts = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/contacts/google")
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch contacts")
      }

      setContacts(data.contacts || [])
      // Select all contacts by default
      setSelectedContacts(new Set(data.contacts.map((_: any, index: number) => index)))
      setStep("preview")
    } catch (err: any) {
      setError(err.message || "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleImport = async () => {
    setIsLoading(true)
    setStep("importing")
    setError(null)

    try {
      const contactsToImport = contacts.filter((_, index) => selectedContacts.has(index))
      const totalContacts = contactsToImport.length
      const batchSize = 200 // Process 200 contacts at a time (increased for better performance)
      
      setProgress({ current: 0, total: totalContacts })

      let totalImported = 0
      let totalUpdated = 0
      let totalSkipped = 0
      let totalErrors = 0

      // Process in batches
      for (let i = 0; i < contactsToImport.length; i += batchSize) {
        const batch = contactsToImport.slice(i, i + batchSize)
        
        try {
          const batchResult = await importGoogleContactsBatch(batch, batchSize, overrideExisting)
          totalImported += batchResult.imported
          totalUpdated += batchResult.updated || 0
          totalSkipped += batchResult.skipped
          totalErrors += batchResult.errors
          
          // Update progress
          setProgress({ 
            current: Math.min(i + batchSize, totalContacts), 
            total: totalContacts 
          })
        } catch (batchError: any) {
          console.error("Batch import error:", batchError)
          totalErrors += batch.length
          // Continue with next batch instead of failing completely
        }
      }

      setResult({ 
        imported: totalImported,
        updated: totalUpdated,
        skipped: totalSkipped, 
        errors: totalErrors 
      })
      
      // Revalidate paths once at the end for better performance
      if (totalImported > 0 || totalUpdated > 0) {
        await revalidateContactsAfterImport()
      }
      
      setStep("complete")
    } catch (err: any) {
      setError(err.message || "An error occurred during import")
      setStep("preview")
    } finally {
      setIsLoading(false)
    }
  }

  const toggleContact = (index: number) => {
    const newSelected = new Set(selectedContacts)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedContacts(newSelected)
  }

  const toggleAll = () => {
    if (selectedContacts.size === contacts.length) {
      setSelectedContacts(new Set())
    } else {
      setSelectedContacts(new Set(contacts.map((_, index) => index)))
    }
  }

  const handleClose = () => {
    setStep("select")
    setContacts([])
    setSelectedContacts(new Set())
    setOverrideExisting(false)
    setResult(null)
    setError(null)
    setProgress({ current: 0, total: 0 })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Import from Google Contacts
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <FiX className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
              <FiAlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-red-900 dark:text-red-100">Error</h3>
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          )}

          {step === "select" && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full mb-4">
                <FiDownload className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Import Your Google Contacts
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                We'll fetch your contacts from Google and let you choose which ones to import.
                Existing contacts won't be duplicated. Large contact lists may take a moment to fetch.
              </p>
              <button
                onClick={handleFetchContacts}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                    Fetching contacts...
                  </>
                ) : (
                  <>
                    <FiDownload className="h-5 w-5" />
                    Fetch Contacts
                  </>
                )}
              </button>
            </div>
          )}

          {step === "preview" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-gray-600 dark:text-gray-400">
                  Found {contacts.length} contact{contacts.length !== 1 ? "s" : ""}. Select which ones to import:
                </p>
                <button
                  onClick={toggleAll}
                  className="text-sm text-purple-600 dark:text-purple-400 hover:underline font-medium"
                >
                  {selectedContacts.size === contacts.length ? "Deselect All" : "Select All"}
                </button>
              </div>

              {/* Override Existing Contacts Option */}
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overrideExisting}
                    onChange={(e) => setOverrideExisting(e.target.checked)}
                    className="mt-1 h-4 w-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">
                      Override existing contacts
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Update existing contacts with fresh data from Google, including photos. 
                      This will add missing photos to contacts you've already imported.
                    </div>
                  </div>
                </label>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                {contacts.map((contact, index) => (
                  <label
                    key={index}
                    className="flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedContacts.has(index)}
                      onChange={() => toggleContact(index)}
                      className="mt-1 h-4 w-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {contact.displayName}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-0.5">
                        {contact.primaryEmail && (
                          <div className="truncate">{contact.primaryEmail}</div>
                        )}
                        {contact.primaryPhone && (
                          <div>{contact.primaryPhone}</div>
                        )}
                        {contact.company && (
                          <div className="truncate">
                            {contact.jobTitle && `${contact.jobTitle} at `}{contact.company}
                          </div>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full mb-4">
                <div className="animate-spin h-8 w-8 border-4 border-purple-600 border-t-transparent rounded-full" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Importing Contacts
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Please wait while we import your selected contacts...
              </p>
              
              {/* Progress Bar */}
              <div className="max-w-md mx-auto">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <span>{progress.current} / {progress.total}</span>
                  <span>{progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div 
                    className="bg-purple-600 h-full transition-all duration-300 ease-out rounded-full"
                    style={{ 
                      width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` 
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {step === "complete" && result && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
                <FiCheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Import Complete!
              </h3>
              <div className="space-y-2 text-gray-600 dark:text-gray-400">
                {result.imported > 0 && (
                  <p className="text-lg">
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      {result.imported}
                    </span>{" "}
                    new contacts imported
                  </p>
                )}
                {result.updated > 0 && (
                  <p className="text-lg">
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {result.updated}
                    </span>{" "}
                    existing contacts updated
                  </p>
                )}
                {result.skipped > 0 && (
                  <p className="text-sm">
                    {result.skipped} contacts skipped (already exist or no name)
                  </p>
                )}
                {result.errors > 0 && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {result.errors} contacts failed to import
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          {step === "preview" && (
            <>
              <button
                onClick={() => setStep("select")}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={selectedContacts.size === 0 || isLoading}
                className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Import {selectedContacts.size} Contact{selectedContacts.size !== 1 ? "s" : ""}
              </button>
            </>
          )}
          {step === "complete" && (
            <button
              onClick={handleClose}
              className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-all"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

