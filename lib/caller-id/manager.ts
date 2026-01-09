/**
 * Caller ID Manager
 * Handles incoming call detection and contact lookup
 * This code runs in the Capacitor WebView context
 */

import { registerPlugin } from "@capacitor/core"

/**
 * CallDetection plugin interface
 * Native plugin that detects incoming calls
 */
interface CallDetectionPlugin {
  startListening(): Promise<void>
  stopListening(): Promise<void>
  addListener(
    eventName: "incomingCall",
    callback: (data: { phoneNumber: string; state: string }) => void
  ): Promise<{ remove: () => void }>
  checkPermissions(): Promise<{ readPhoneState: string; readCallLog: string }>
  requestPermissions(): Promise<{ readPhoneState: string; readCallLog: string }>
}

/**
 * Overlay plugin interface
 * Native plugin that shows caller ID overlay
 */
interface OverlayPlugin {
  checkPermission(): Promise<{ granted: boolean }>
  requestPermission(): Promise<void>
  show(options: {
    displayName: string
    company?: string
    imageUrl?: string
    phoneNumber?: string
  }): Promise<void>
  hide(): Promise<void>
  addListener(
    eventName: "overlayTapped",
    callback: (data: { phoneNumber: string }) => void
  ): Promise<{ remove: () => void }>
}

export interface CallerIdContact {
  displayName: string
  company: string | null
  imageUrl: string | null
}

// Lazy-loaded plugin instances
// These are registered on first access, not at module load time
// This is critical because Next.js SSR would set them to null otherwise
let _callDetection: CallDetectionPlugin | null = null
let _overlay: OverlayPlugin | null = null

/**
 * Get the CallDetection plugin (lazy initialization)
 * Registers the plugin on first use when running in Capacitor context
 */
function getCallDetection(): CallDetectionPlugin | null {
  if (_callDetection) return _callDetection
  if (typeof window !== "undefined" && (window as any).Capacitor) {
    console.log("[CallerID] Registering CallDetection plugin")
    _callDetection = registerPlugin<CallDetectionPlugin>("CallDetection")
  }
  return _callDetection
}

/**
 * Get the Overlay plugin (lazy initialization)
 * Registers the plugin on first use when running in Capacitor context
 */
function getOverlay(): OverlayPlugin | null {
  if (_overlay) return _overlay
  if (typeof window !== "undefined" && (window as any).Capacitor) {
    console.log("[CallerID] Registering Overlay plugin")
    _overlay = registerPlugin<OverlayPlugin>("Overlay")
  }
  return _overlay
}

export class CallerIdManager {
  private isListening = false
  private listenerRemove: (() => void) | null = null
  private overlayListenerRemove: (() => void) | null = null
  private currentPhoneNumber: string | null = null
  private token: string | null = null
  private baseUrl: string | null = null

  /**
   * Initialize the caller ID manager
   * Sets up call detection listener
   */
  async initialize(): Promise<boolean> {
    const CallDetection = getCallDetection()
    const Overlay = getOverlay()

    if (!CallDetection || !Overlay) {
      console.log("[CallerID] Not in Capacitor context - caller ID not available")
      return false
    }

    console.log("[CallerID] Initializing caller ID manager...")

    // Load stored credentials
    const hasToken = await this.loadStoredCredentials()
    if (!hasToken) {
      console.log("[CallerID] No API token configured - caller ID will not work")
      return false
    }

    console.log("[CallerID] Token loaded, checking permissions...")

    // Check permissions
    const hasPermissions = await this.checkPermissions()
    if (!hasPermissions) {
      console.log("[CallerID] Missing permissions for caller ID")
      return false
    }

    console.log("[CallerID] Permissions OK, setting up listeners...")

    // Listen for overlay taps
    await this.setupOverlayTapListener()

    // Start listening for calls
    await this.startListening()

    console.log("[CallerID] Initialization complete!")
    return true
  }

  /**
   * Load stored token and base URL from Capacitor Preferences
   */
  private async loadStoredCredentials(): Promise<boolean> {
    try {
      const { Preferences } = await import("@capacitor/preferences")
      const tokenResult = await Preferences.get({ key: "orbit_mobile_token" })
      const urlResult = await Preferences.get({ key: "orbit_base_url" })

      this.token = tokenResult.value
      this.baseUrl = urlResult.value

      console.log("[CallerID] Credentials loaded:", {
        hasToken: !!this.token,
        hasBaseUrl: !!this.baseUrl,
      })

      return !!this.token && !!this.baseUrl
    } catch (error) {
      console.error("[CallerID] Error loading credentials:", error)
      return false
    }
  }

  /**
   * Set up listener for overlay tap events
   */
  private async setupOverlayTapListener(): Promise<void> {
    const Overlay = getOverlay()
    if (!Overlay) return

    try {
      const listener = await Overlay.addListener("overlayTapped", (data) => {
        console.log("[CallerID] Overlay tapped, phone:", data.phoneNumber)
        this.navigateToCallPage(data.phoneNumber)
      })
      this.overlayListenerRemove = listener.remove
    } catch (error) {
      console.error("[CallerID] Error setting up overlay tap listener:", error)
    }
  }

  /**
   * Navigate to the call page with full contact details
   */
  private navigateToCallPage(phoneNumber: string): void {
    if (!phoneNumber) return

    // Navigate the WebView to the call page
    const callPageUrl = `/call?phone=${encodeURIComponent(phoneNumber)}`
    window.location.href = callPageUrl
  }

  /**
   * Check if we have the required permissions
   */
  async checkPermissions(): Promise<boolean> {
    const CallDetection = getCallDetection()
    const Overlay = getOverlay()

    if (!CallDetection || !Overlay) {
      console.log("[CallerID] checkPermissions: Plugins not available")
      return false
    }

    try {
      const callPerms = await CallDetection.checkPermissions()
      const overlayPerm = await Overlay.checkPermission()

      console.log("[CallerID] Permission status:", {
        readPhoneState: callPerms.readPhoneState,
        readCallLog: callPerms.readCallLog,
        overlay: overlayPerm.granted,
      })

      return (
        callPerms.readPhoneState === "granted" &&
        callPerms.readCallLog === "granted" &&
        overlayPerm.granted
      )
    } catch (error) {
      console.error("[CallerID] Error checking permissions:", error)
      return false
    }
  }

  /**
   * Request all required permissions
   */
  async requestPermissions(): Promise<boolean> {
    const CallDetection = getCallDetection()
    const Overlay = getOverlay()

    if (!CallDetection || !Overlay) {
      console.log("[CallerID] requestPermissions: Plugins not available")
      return false
    }

    try {
      console.log("[CallerID] Requesting phone permissions...")
      // Request phone state and call log permissions
      await CallDetection.requestPermissions()

      // Request overlay permission
      const overlayPerm = await Overlay.checkPermission()
      if (!overlayPerm.granted) {
        console.log("[CallerID] Requesting overlay permission...")
        await Overlay.requestPermission()
      }

      return this.checkPermissions()
    } catch (error) {
      console.error("[CallerID] Error requesting permissions:", error)
      return false
    }
  }

  /**
   * Start listening for incoming calls
   */
  async startListening(): Promise<void> {
    const CallDetection = getCallDetection()

    if (!CallDetection || this.isListening) return

    try {
      console.log("[CallerID] Setting up incoming call listener...")

      // Add listener for incoming calls
      const listener = await CallDetection.addListener(
        "incomingCall",
        async (data) => {
          console.log("[CallerID] Incoming call:", data.phoneNumber, data.state)

          if (data.state === "ringing") {
            await this.handleIncomingCall(data.phoneNumber)
          } else if (data.state === "idle" || data.state === "offhook") {
            // Call ended or answered - hide overlay
            await this.hideOverlay()
          }
        }
      )

      this.listenerRemove = listener.remove
      await CallDetection.startListening()
      this.isListening = true
      console.log("[CallerID] Started listening for calls")
    } catch (error) {
      console.error("[CallerID] Error starting call listener:", error)
    }
  }

  /**
   * Stop listening for incoming calls
   */
  async stopListening(): Promise<void> {
    const CallDetection = getCallDetection()

    if (!CallDetection || !this.isListening) return

    try {
      if (this.listenerRemove) {
        this.listenerRemove()
        this.listenerRemove = null
      }
      await CallDetection.stopListening()
      this.isListening = false
      console.log("[CallerID] Stopped listening for calls")
    } catch (error) {
      console.error("[CallerID] Error stopping call listener:", error)
    }
  }

  /**
   * Handle an incoming call - look up contact and show overlay
   */
  private async handleIncomingCall(phoneNumber: string): Promise<void> {
    try {
      console.log("[CallerID] Handling incoming call from:", phoneNumber)

      // Store current phone number for navigation
      this.currentPhoneNumber = phoneNumber

      // Look up the contact
      const contact = await this.lookupPhone(phoneNumber)

      if (contact) {
        console.log("[CallerID] Contact found:", contact.displayName)
        // Show the overlay with contact info
        await this.showOverlay(contact, phoneNumber)
      } else {
        console.log("[CallerID] No contact found for:", phoneNumber)
      }
    } catch (error) {
      console.error("[CallerID] Error handling incoming call:", error)
    }
  }

  /**
   * Look up a phone number via the API
   */
  private async lookupPhone(phoneNumber: string): Promise<CallerIdContact | null> {
    if (!this.token || !this.baseUrl) {
      console.log("[CallerID] Cannot lookup - no token or baseUrl")
      return null
    }

    try {
      const url = `${this.baseUrl}/api/mobile/lookup?phone=${encodeURIComponent(phoneNumber)}`
      console.log("[CallerID] Looking up phone:", url)

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      })

      if (!response.ok) {
        console.log("[CallerID] Lookup failed:", response.status)
        return null
      }

      const data = await response.json()
      if (data.found && data.contact) {
        return data.contact
      }
      return null
    } catch (error) {
      console.error("[CallerID] Error looking up phone:", error)
      return null
    }
  }

  /**
   * Show the caller ID overlay
   */
  private async showOverlay(
    contact: CallerIdContact,
    phoneNumber: string
  ): Promise<void> {
    const Overlay = getOverlay()
    if (!Overlay) return

    try {
      console.log("[CallerID] Showing overlay for:", contact.displayName)

      await Overlay.show({
        displayName: contact.displayName,
        company: contact.company || undefined,
        imageUrl: contact.imageUrl || undefined,
        phoneNumber: phoneNumber,
      })

      // Auto-hide after 15 seconds if call not answered
      setTimeout(() => {
        this.hideOverlay().catch(() => {})
      }, 15000)
    } catch (error) {
      console.error("[CallerID] Error showing overlay:", error)
    }
  }

  /**
   * Hide the caller ID overlay
   */
  private async hideOverlay(): Promise<void> {
    const Overlay = getOverlay()
    if (!Overlay) return

    try {
      await Overlay.hide()
    } catch (error) {
      // Ignore errors when hiding (may not be shown)
    }
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    await this.stopListening()
    await this.hideOverlay()
    if (this.overlayListenerRemove) {
      this.overlayListenerRemove()
      this.overlayListenerRemove = null
    }
    this.currentPhoneNumber = null
  }
}

// Export singleton instance
export const callerIdManager = new CallerIdManager()
