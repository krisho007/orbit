"use client"

import { useState, useEffect } from "react"
import { FiTrash2, FiSmartphone, FiCheck, FiAlertCircle } from "react-icons/fi"

type MobileToken = {
  id: string
  deviceName: string | null
  platform: string
  lastUsedAt: string
  expiresAt: string
  createdAt: string
}

interface MobileTokensManagerProps {
  tokens: MobileToken[]
}

// Check if running inside Capacitor
function isCapacitor(): boolean {
  return typeof window !== "undefined" && !!(window as any).Capacitor
}

// Store token in Capacitor Preferences
async function storeTokenInApp(token: string, baseUrl: string): Promise<boolean> {
  try {
    const { Preferences } = await import("@capacitor/preferences")
    await Preferences.set({ key: "orbit_mobile_token", value: token })
    await Preferences.set({ key: "orbit_base_url", value: baseUrl })
    return true
  } catch (error) {
    console.error("Failed to store token in app:", error)
    return false
  }
}

// Check if token is already stored in app
async function getStoredToken(): Promise<string | null> {
  try {
    const { Preferences } = await import("@capacitor/preferences")
    const result = await Preferences.get({ key: "orbit_mobile_token" })
    return result.value
  } catch {
    return null
  }
}

export function MobileTokensManager({ tokens: initialTokens }: MobileTokensManagerProps) {
  const [tokens, setTokens] = useState(initialTokens)
  const [isLoading, setIsLoading] = useState(false)
  const [isInApp, setIsInApp] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const checkEnvironment = async () => {
      const inCapacitor = isCapacitor()
      setIsInApp(inCapacitor)

      if (inCapacitor) {
        // Check if already set up
        const storedToken = await getStoredToken()
        setIsEnabled(!!storedToken)
      }
    }
    checkEnvironment()
  }, [])

  const handleEnableCallerId = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      // Generate a new token
      const response = await fetch("/api/mobile/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceName: "Android Phone",
          platform: "android",
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to create token")
      }

      const data = await response.json()

      // Store token directly in the app
      const baseUrl = window.location.origin
      const stored = await storeTokenInApp(data.token, baseUrl)

      if (!stored) {
        throw new Error("Failed to save token to device")
      }

      setIsEnabled(true)
      setSuccess(true)

      // Refresh token list
      const listResponse = await fetch("/api/mobile/auth/token")
      if (listResponse.ok) {
        const listData = await listResponse.json()
        setTokens(listData.tokens)
      }
    } catch (err) {
      setError("Failed to enable caller ID. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDisableCallerId = async () => {
    if (!confirm("Disable caller ID? You won't see contact names when receiving calls.")) {
      return
    }

    // Find the current device's token and revoke it
    const currentToken = tokens.find(t => t.platform === "android")
    if (currentToken) {
      try {
        await fetch("/api/mobile/auth/token", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokenId: currentToken.id }),
        })

        // Clear from device storage
        const { Preferences } = await import("@capacitor/preferences")
        await Preferences.remove({ key: "orbit_mobile_token" })
        await Preferences.remove({ key: "orbit_base_url" })

        setTokens(tokens.filter(t => t.id !== currentToken.id))
        setIsEnabled(false)
      } catch (err) {
        setError("Failed to disable caller ID")
      }
    }
  }

  const handleDeleteToken = async (tokenId: string) => {
    if (!confirm("Revoke this token? The device will need to re-enable caller ID.")) {
      return
    }

    try {
      const response = await fetch("/api/mobile/auth/token", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId }),
      })

      if (response.ok) {
        setTokens(tokens.filter((t) => t.id !== tokenId))
      }
    } catch (err) {
      setError("Failed to revoke token")
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return formatDate(dateStr)
  }

  // Running inside the mobile app
  if (isInApp) {
    return (
      <div>
        <p className="text-sm text-gray-500 mb-4">
          Enable caller ID to see contact details when you receive phone calls.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2">
            <FiAlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm flex items-center gap-2">
            <FiCheck className="h-4 w-4 flex-shrink-0" />
            Caller ID enabled! You&apos;ll see contact names for incoming calls.
          </div>
        )}

        {isEnabled ? (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-green-100 rounded-full">
                <FiCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-green-800">Caller ID is enabled</p>
                <p className="text-sm text-green-600">You&apos;ll see contact names when receiving calls</p>
              </div>
            </div>
            <button
              onClick={handleDisableCallerId}
              className="text-sm text-green-700 hover:text-green-900 underline"
            >
              Disable caller ID
            </button>
          </div>
        ) : (
          <button
            onClick={handleEnableCallerId}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            <FiSmartphone className="h-5 w-5" />
            {isLoading ? "Setting up..." : "Enable Caller ID"}
          </button>
        )}

        <p className="text-xs text-gray-400 mt-4">
          Note: You&apos;ll need to grant phone and overlay permissions when prompted.
        </p>
      </div>
    )
  }

  // Running in web browser - show device management
  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Caller ID is available on the Orbit mobile app. Open this page in the app to enable it, or manage your connected devices below.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Token list */}
      <div className="space-y-2">
        {tokens.map((token) => (
          <div key={token.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3 flex-1">
              <FiSmartphone className="h-5 w-5 text-gray-400" />
              <div>
                <span className="font-medium text-gray-900">
                  {token.deviceName || "Android Device"}
                </span>
                <div className="text-sm text-gray-500">
                  Last used: {formatRelativeTime(token.lastUsedAt)}
                  {" · "}
                  Expires: {formatDate(token.expiresAt)}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleDeleteToken(token.id)}
              className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Revoke token"
            >
              <FiTrash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {tokens.length === 0 && (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <FiSmartphone className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">No devices connected</p>
          <p className="text-sm text-gray-400">Open Settings in the mobile app to enable caller ID</p>
        </div>
      )}
    </div>
  )
}
