"use client"

import { useMobileAuth } from "./mobile-auth-provider"
import { FiArrowRight } from "react-icons/fi"

interface SignInFormProps {
  signInAction: () => Promise<void>
}

export function NavSignInButton({ signInAction }: SignInFormProps) {
  const { isCapacitor, openMobileOAuth } = useMobileAuth()

  if (isCapacitor) {
    return (
      <button
        type="button"
        onClick={() => openMobileOAuth()}
        className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
      >
        Sign In
      </button>
    )
  }

  return (
    <form action={signInAction}>
      <button
        type="submit"
        className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
      >
        Sign In
      </button>
    </form>
  )
}

export function HeroSignInButton({ signInAction }: SignInFormProps) {
  const { isCapacitor, openMobileOAuth } = useMobileAuth()

  if (isCapacitor) {
    return (
      <button
        type="button"
        onClick={() => openMobileOAuth()}
        className="inline-flex items-center gap-2 px-8 py-4 bg-purple-600 text-white text-lg font-semibold rounded-xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40"
      >
        Get Started Free
        <FiArrowRight className="h-5 w-5" />
      </button>
    )
  }

  return (
    <form action={signInAction}>
      <button
        type="submit"
        className="inline-flex items-center gap-2 px-8 py-4 bg-purple-600 text-white text-lg font-semibold rounded-xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40"
      >
        Get Started Free
        <FiArrowRight className="h-5 w-5" />
      </button>
    </form>
  )
}

export function FreeGetStartedButton({ signInAction }: SignInFormProps) {
  const { isCapacitor, openMobileOAuth } = useMobileAuth()

  if (isCapacitor) {
    return (
      <button
        type="button"
        onClick={() => openMobileOAuth()}
        className="w-full py-3 px-6 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
      >
        Get Started
      </button>
    )
  }

  return (
    <form action={signInAction}>
      <button
        type="submit"
        className="w-full py-3 px-6 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
      >
        Get Started
      </button>
    </form>
  )
}

export function ProGetStartedButton({ signInAction }: SignInFormProps) {
  const { isCapacitor, openMobileOAuth } = useMobileAuth()

  if (isCapacitor) {
    return (
      <button
        type="button"
        onClick={() => openMobileOAuth()}
        className="w-full py-3 px-6 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40"
      >
        Get Started
      </button>
    )
  }

  return (
    <form action={signInAction}>
      <button
        type="submit"
        className="w-full py-3 px-6 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40"
      >
        Get Started
      </button>
    </form>
  )
}
