import { auth, signIn } from "@/auth"
import { redirect } from "next/navigation"

export default async function Home() {
  const session = await auth()
  
  if (session) {
    redirect('/contacts')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md px-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold text-gray-900">Orbit</h1>
            <p className="text-gray-600">Your personal relationship CRM</p>
          </div>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-500 text-center">
              Keep track of your contacts, conversations, and relationships all in one place.
            </p>
            
            <form
              action={async () => {
                "use server"
                await signIn("google", { redirectTo: "/contacts" })
              }}
            >
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white border-2 border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </button>
            </form>
          </div>
          
          <div className="pt-6 border-t border-gray-200">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-indigo-600">📇</div>
                <div className="text-xs text-gray-600 mt-1">Contacts</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-indigo-600">💬</div>
                <div className="text-xs text-gray-600 mt-1">Conversations</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-indigo-600">📅</div>
                <div className="text-xs text-gray-600 mt-1">Events</div>
              </div>
            </div>
          </div>
          
          <div className="pt-4 border-t border-gray-200 mt-4">
            <div className="flex justify-center gap-4 text-xs text-gray-500">
              <a href="/privacy" className="hover:text-indigo-600 transition-colors">Privacy Policy</a>
              <span>•</span>
              <a href="/terms" className="hover:text-indigo-600 transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
