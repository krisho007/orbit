/**
 * API Client for Orbit Mobile App
 * Uses token-based authentication for native features
 */

import { Preferences } from "@capacitor/preferences"

const TOKEN_KEY = "orbit_mobile_token"
const BASE_URL_KEY = "orbit_base_url"

export interface CallerIdContact {
  id: string
  displayName: string
  company: string | null
  imageUrl: string | null
}

export interface LookupResult {
  found: boolean
  contact?: CallerIdContact
}

export class OrbitApiClient {
  private token: string | null = null
  private baseUrl: string = "http://localhost:3000"

  /**
   * Initialize the API client
   * Loads token and base URL from preferences
   */
  async initialize(): Promise<boolean> {
    const tokenResult = await Preferences.get({ key: TOKEN_KEY })
    const urlResult = await Preferences.get({ key: BASE_URL_KEY })

    this.token = tokenResult.value
    if (urlResult.value) {
      this.baseUrl = urlResult.value
    }

    return this.token !== null
  }

  /**
   * Set the authentication token
   */
  async setToken(token: string): Promise<void> {
    this.token = token
    await Preferences.set({ key: TOKEN_KEY, value: token })
  }

  /**
   * Set the base URL for API requests
   */
  async setBaseUrl(url: string): Promise<void> {
    this.baseUrl = url
    await Preferences.set({ key: BASE_URL_KEY, value: url })
  }

  /**
   * Clear the stored token
   */
  async clearToken(): Promise<void> {
    this.token = null
    await Preferences.remove({ key: TOKEN_KEY })
  }

  /**
   * Check if we have a valid token
   */
  hasToken(): boolean {
    return this.token !== null
  }

  /**
   * Look up a contact by phone number
   * Used for caller ID feature
   */
  async lookupPhone(phoneNumber: string): Promise<LookupResult> {
    if (!this.token) {
      console.warn("No token set for API client")
      return { found: false }
    }

    try {
      const encodedPhone = encodeURIComponent(phoneNumber)
      const response = await fetch(
        `${this.baseUrl}/api/mobile/lookup?phone=${encodedPhone}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
        }
      )

      if (!response.ok) {
        console.error("Lookup failed:", response.status)
        return { found: false }
      }

      const data = await response.json()
      return data as LookupResult
    } catch (error) {
      console.error("Phone lookup error:", error)
      return { found: false }
    }
  }
}

// Singleton instance
export const apiClient = new OrbitApiClient()
