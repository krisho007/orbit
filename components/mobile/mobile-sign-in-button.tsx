"use client"

import { useMobileAuth } from "./mobile-auth-provider"
import { ReactNode } from "react"

interface MobileSignInButtonProps {
  children: ReactNode
  className?: string
  formAction: () => Promise<void>
}

/**
 * A sign-in button that handles both web and mobile (Capacitor) auth flows.
 *
 * On web: Uses the server action form submission (normal Auth.js flow)
 * On mobile: Opens OAuth in system browser for proper cookie/PKCE handling
 */
export function MobileSignInButton({
  children,
  className,
  formAction,
}: MobileSignInButtonProps) {
  const { isCapacitor, openMobileOAuth } = useMobileAuth()

  if (isCapacitor) {
    // Mobile: Use system browser for OAuth
    return (
      <button
        type="button"
        onClick={() => openMobileOAuth()}
        className={className}
      >
        {children}
      </button>
    )
  }

  // Web: Use normal form submission
  return (
    <form action={formAction}>
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  )
}
