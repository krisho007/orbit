/**
 * Caller ID Manager
 * Handles incoming call detection and contact lookup
 */

import { registerPlugin } from "@capacitor/core"
import { apiClient, CallerIdContact } from "../api/client"

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
  }): Promise<void>
  hide(): Promise<void>
}

// Register native plugins
const CallDetection = registerPlugin<CallDetectionPlugin>("CallDetection")
const Overlay = registerPlugin<OverlayPlugin>("Overlay")

export class CallerIdManager {
  private isListening = false
  private listenerRemove: (() => void) | null = null

  /**
   * Initialize the caller ID manager
   * Sets up call detection listener
   */
  async initialize(): Promise<boolean> {
    // Initialize API client
    const hasToken = await apiClient.initialize()
    if (!hasToken) {
      console.log("No API token configured - caller ID will not work")
      return false
    }

    // Check permissions
    const hasPermissions = await this.checkPermissions()
    if (!hasPermissions) {
      console.log("Missing permissions for caller ID")
      return false
    }

    // Start listening for calls
    await this.startListening()
    return true
  }

  /**
   * Check if we have the required permissions
   */
  async checkPermissions(): Promise<boolean> {
    try {
      const callPerms = await CallDetection.checkPermissions()
      const overlayPerm = await Overlay.checkPermission()

      return (
        callPerms.readPhoneState === "granted" &&
        callPerms.readCallLog === "granted" &&
        overlayPerm.granted
      )
    } catch (error) {
      console.error("Error checking permissions:", error)
      return false
    }
  }

  /**
   * Request all required permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      // Request phone state and call log permissions
      const callPerms = await CallDetection.requestPermissions()

      // Request overlay permission
      const overlayPerm = await Overlay.checkPermission()
      if (!overlayPerm.granted) {
        await Overlay.requestPermission()
      }

      return this.checkPermissions()
    } catch (error) {
      console.error("Error requesting permissions:", error)
      return false
    }
  }

  /**
   * Start listening for incoming calls
   */
  async startListening(): Promise<void> {
    if (this.isListening) return

    try {
      // Add listener for incoming calls
      const listener = await CallDetection.addListener(
        "incomingCall",
        async (data) => {
          console.log("Incoming call:", data.phoneNumber, data.state)

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
      console.log("Started listening for calls")
    } catch (error) {
      console.error("Error starting call listener:", error)
    }
  }

  /**
   * Stop listening for incoming calls
   */
  async stopListening(): Promise<void> {
    if (!this.isListening) return

    try {
      if (this.listenerRemove) {
        this.listenerRemove()
        this.listenerRemove = null
      }
      await CallDetection.stopListening()
      this.isListening = false
      console.log("Stopped listening for calls")
    } catch (error) {
      console.error("Error stopping call listener:", error)
    }
  }

  /**
   * Handle an incoming call - look up contact and show overlay
   */
  private async handleIncomingCall(phoneNumber: string): Promise<void> {
    try {
      // Look up the contact
      const result = await apiClient.lookupPhone(phoneNumber)

      if (result.found && result.contact) {
        // Show the overlay with contact info
        await this.showOverlay(result.contact)
      }
    } catch (error) {
      console.error("Error handling incoming call:", error)
    }
  }

  /**
   * Show the caller ID overlay
   */
  private async showOverlay(contact: CallerIdContact): Promise<void> {
    try {
      await Overlay.show({
        displayName: contact.displayName,
        company: contact.company || undefined,
        imageUrl: contact.imageUrl || undefined,
      })

      // Auto-hide after 15 seconds if call not answered
      setTimeout(() => {
        this.hideOverlay().catch(() => {})
      }, 15000)
    } catch (error) {
      console.error("Error showing overlay:", error)
    }
  }

  /**
   * Hide the caller ID overlay
   */
  private async hideOverlay(): Promise<void> {
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
  }
}

// Export singleton instance
export const callerIdManager = new CallerIdManager()

// Export plugins for direct access if needed
export { CallDetection, Overlay }
