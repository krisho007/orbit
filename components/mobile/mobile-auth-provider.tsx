"use client"

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react"

interface MobileAuthContextType {
  isCapacitor: boolean
  openMobileOAuth: () => Promise<void>
}

const MobileAuthContext = createContext<MobileAuthContextType>({
  isCapacitor: false,
  openMobileOAuth: async () => {},
})

export function useMobileAuth() {
  return useContext(MobileAuthContext)
}

interface MobileAuthProviderProps {
  children: ReactNode
}

export function MobileAuthProvider({ children }: MobileAuthProviderProps) {
  const [isCapacitor, setIsCapacitor] = useState(false)

  useEffect(() => {
    // Detect if we're running in a Capacitor WebView
    const checkCapacitor = () => {
      // Check for Capacitor global
      const hasCapacitor = typeof window !== "undefined" && (window as any).Capacitor
      console.log("[MobileAuth] Capacitor detected:", hasCapacitor)

      if (hasCapacitor) {
        const platform = (window as any).Capacitor?.getPlatform?.() || "unknown"
        console.log("[MobileAuth] Platform:", platform)
        setIsCapacitor(true)
        setupDeepLinkHandler()
      }
    }

    checkCapacitor()

    // Also check after a short delay in case Capacitor loads async
    const timeout = setTimeout(checkCapacitor, 100)
    return () => clearTimeout(timeout)
  }, [])

  const setupDeepLinkHandler = useCallback(async () => {
    try {
      const { App } = await import("@capacitor/app")

      App.addListener("appUrlOpen", async (event) => {
        console.log("Deep link received:", event.url)

        try {
          const url = new URL(event.url)

          // Handle OAuth callback: orbit://auth?code=xxx
          if (url.protocol === "orbit:" && url.host === "auth") {
            const code = url.searchParams.get("code")

            if (code) {
              // Close the browser
              try {
                const { Browser } = await import("@capacitor/browser")
                await Browser.close()
              } catch (e) {
                // Browser might not be open
              }

              // Navigate to session exchange endpoint
              window.location.href = `/api/auth/mobile/session?code=${code}`
            }
          }
        } catch (e) {
          console.error("Error handling deep link:", e)
        }
      })
    } catch (e) {
      console.error("Error setting up deep link handler:", e)
    }
  }, [])

  const openMobileOAuth = useCallback(async () => {
    console.log("[MobileAuth] Opening OAuth in system browser")
    try {
      const { Browser } = await import("@capacitor/browser")

      // Use the mobile OAuth initiation endpoint which handles the redirect properly
      const oauthUrl = `${window.location.origin}/api/auth/mobile/initiate`
      console.log("[MobileAuth] OAuth URL:", oauthUrl)

      await Browser.open({
        url: oauthUrl,
        presentationStyle: "popover",
      })
      console.log("[MobileAuth] Browser opened successfully")
    } catch (e) {
      console.error("[MobileAuth] Error opening OAuth browser:", e)
      // Fallback to regular navigation
      window.location.href = "/api/auth/mobile/initiate"
    }
  }, [])

  return (
    <MobileAuthContext.Provider value={{ isCapacitor, openMobileOAuth }}>
      {children}
    </MobileAuthContext.Provider>
  )
}
