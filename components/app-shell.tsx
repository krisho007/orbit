"use client"

import { Session } from "next-auth"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { 
  FiUsers, 
  FiMessageSquare, 
  FiCalendar, 
  FiMessageCircle, 
  FiSettings,
  FiLogOut 
} from "react-icons/fi"

interface AppShellProps {
  session: Session
  children: React.ReactNode
}

const navItems = [
  { href: "/contacts", label: "Contacts", icon: FiUsers },
  { href: "/conversations", label: "Conversations", icon: FiMessageSquare },
  { href: "/events", label: "Events", icon: FiCalendar },
  { href: "/assistant", label: "Assistant", icon: FiMessageCircle },
  { href: "/settings", label: "Settings", icon: FiSettings },
]

export function AppShell({ session, children }: AppShellProps) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-64 bg-white border-r border-gray-200">
        <div className="flex flex-col flex-1 pt-5 pb-4 overflow-y-auto">
          <div className="flex items-center flex-shrink-0 px-4">
            <h1 className="text-2xl font-bold text-indigo-600">Orbit</h1>
          </div>
          
          <nav className="mt-8 flex-1 px-2 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname.startsWith(item.href)
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors
                    ${isActive 
                      ? 'bg-indigo-50 text-indigo-600' 
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }
                  `}
                >
                  <Icon className={`mr-3 h-5 w-5 ${isActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-500'}`} />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          
          <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
            <div className="flex items-center w-full">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {session.user?.name}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {session.user?.email}
                </p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="ml-3 p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 rounded-md"
                title="Sign out"
              >
                <FiLogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-10">
        <div className="flex items-center justify-between px-4 h-14">
          <h1 className="text-xl font-bold text-indigo-600">Orbit</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">{session.user?.name}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="md:pl-64 flex flex-col flex-1">
        <main className="flex-1 pt-14 md:pt-0 pb-20 md:pb-0">
          {children}
        </main>
        
        {/* Footer - hidden on mobile to not interfere with bottom nav */}
        <footer className="hidden md:block border-t border-gray-200 bg-white py-4">
          <div className="px-8">
            <div className="flex justify-center gap-4 text-xs text-gray-500">
              <Link href="/privacy" className="hover:text-indigo-600 transition-colors">
                Privacy Policy
              </Link>
              <span>•</span>
              <Link href="/terms" className="hover:text-indigo-600 transition-colors">
                Terms of Service
              </Link>
            </div>
          </div>
        </footer>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10">
        <div className="grid grid-cols-5 h-16">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname.startsWith(item.href)
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex flex-col items-center justify-center space-y-1
                  ${isActive ? 'text-indigo-600' : 'text-gray-500'}
                `}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}


