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
      if (typeof window !== "undefined" && (window as any).Capacitor) {
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
    try {
      const { Browser } = await import("@capacitor/browser")

      const callbackUrl = encodeURIComponent("/api/auth/mobile/callback")
      const oauthUrl = `${window.location.origin}/api/auth/signin/google?callbackUrl=${callbackUrl}`

      await Browser.open({
        url: oauthUrl,
        presentationStyle: "popover",
      })
    } catch (e) {
      console.error("Error opening OAuth browser:", e)
      // Fallback to regular navigation
      window.location.href = "/api/auth/signin/google"
    }
  }, [])

  return (
    <MobileAuthContext.Provider value={{ isCapacitor, openMobileOAuth }}>
      {children}
    </MobileAuthContext.Provider>
  )
}
