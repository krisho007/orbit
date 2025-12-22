import { auth, signIn } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { FiUsers, FiMessageSquare, FiCalendar, FiCheck, FiGithub, FiArrowRight } from "react-icons/fi"
import { LINKS } from "@/lib/constants"

export default async function Home() {
  const session = await auth()
  
  if (session) {
    redirect('/contacts')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-gray-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-2xl font-bold text-indigo-600">Orbit</h1>
            <form
              action={async () => {
                "use server"
                await signIn("google", { redirectTo: "/contacts" })
              }}
            >
              <button
                type="submit"
                className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                Sign In
              </button>
            </form>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden hero-grain">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-purple-50/50 via-white to-white dark:from-purple-950/20 dark:via-slate-900 dark:to-slate-900" />
        
        {/* Decorative blur */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-r from-purple-200/40 to-pink-200/40 dark:from-purple-900/20 dark:to-pink-900/20 rounded-full blur-3xl" />
        
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-serif-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold text-gray-900 dark:text-white leading-tight animate-fade-in-up">
            Nurture the relationships
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600">that matter</span>
          </h2>
          
          <p className="mt-6 md:mt-8 text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto animate-fade-in-up-delay-1">
            Your personal CRM to keep track of contacts, conversations, and meaningful connections. 
            Never forget an important detail again.
          </p>
          
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up-delay-2">
            <form
              action={async () => {
                "use server"
                await signIn("google", { redirectTo: "/contacts" })
              }}
            >
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-8 py-4 bg-purple-600 text-white text-lg font-semibold rounded-xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40"
              >
                Get Started Free
                <FiArrowRight className="h-5 w-5" />
              </button>
            </form>
            <a
              href={LINKS.github}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-4 text-gray-700 dark:text-gray-300 font-medium hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
            >
              <FiGithub className="h-5 w-5" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 md:py-28 bg-white dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h3 className="font-serif-display text-3xl md:text-4xl font-semibold text-gray-900 dark:text-white">
              Everything you need to stay connected
            </h3>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Simple, powerful tools to manage your personal and professional relationships.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {/* Contacts Feature */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 card-hover">
              <div className="w-14 h-14 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center mb-6">
                <FiUsers className="h-7 w-7 text-purple-600 dark:text-purple-400" />
              </div>
              <h4 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Contacts
              </h4>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Store detailed profiles with photos, notes, tags, and custom fields. Import from Google Contacts with one click.
              </p>
            </div>
            
            {/* Conversations Feature */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 card-hover">
              <div className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-6">
                <FiMessageSquare className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              </div>
              <h4 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Conversations
              </h4>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Log calls, meetings, and messages. Keep track of what you discussed and any follow-ups needed.
              </p>
            </div>
            
            {/* Events Feature */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 card-hover">
              <div className="w-14 h-14 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-6">
                <FiCalendar className="h-7 w-7 text-green-600 dark:text-green-400" />
              </div>
              <h4 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Events
              </h4>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Track birthdays, meetings, and important dates. Never miss an opportunity to reach out.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 md:py-28 bg-gray-50 dark:bg-slate-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h3 className="font-serif-display text-3xl md:text-4xl font-semibold text-gray-900 dark:text-white">
              Simple, transparent pricing
            </h3>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
              Start free, upgrade when you need more.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Tier */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8">
              <div className="mb-6">
                <h4 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Free</h4>
                <p className="text-gray-500 dark:text-gray-400 mt-1">For personal use</p>
              </div>
              
              <div className="mb-8">
                <span className="text-4xl font-bold text-gray-900 dark:text-white">$0</span>
                <span className="text-gray-500 dark:text-gray-400">/month</span>
              </div>
              
              <ul className="space-y-4 mb-8">
                <li className="flex items-start gap-3">
                  <FiCheck className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Up to 500 contacts</span>
                </li>
                <li className="flex items-start gap-3">
                  <FiCheck className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Unlimited conversations</span>
                </li>
                <li className="flex items-start gap-3">
                  <FiCheck className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Unlimited events</span>
                </li>
                <li className="flex items-start gap-3">
                  <FiCheck className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Google Contacts import</span>
                </li>
                <li className="flex items-start gap-3">
                  <FiCheck className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">AI Assistant</span>
                </li>
              </ul>
              
              <form
                action={async () => {
                  "use server"
                  await signIn("google", { redirectTo: "/contacts" })
                }}
              >
                <button
                  type="submit"
                  className="w-full py-3 px-6 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                >
                  Get Started
                </button>
              </form>
            </div>
            
            {/* Pro Tier */}
            <div className="relative pricing-highlight">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 border-purple-500 p-8 relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-semibold rounded-full">
                    Recommended
                  </span>
                </div>
                
                <div className="mb-6">
                  <h4 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Pro</h4>
                  <p className="text-gray-500 dark:text-gray-400 mt-1">For power users</p>
                </div>
                
                <div className="mb-8">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white">$8</span>
                  <span className="text-gray-500 dark:text-gray-400">/month</span>
                </div>
                
                <ul className="space-y-4 mb-8">
                  <li className="flex items-start gap-3">
                    <FiCheck className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300"><strong>Up to 5,000 contacts</strong></span>
                  </li>
                  <li className="flex items-start gap-3">
                    <FiCheck className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">Unlimited conversations</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <FiCheck className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">Unlimited events</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <FiCheck className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">Google Contacts import</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <FiCheck className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">AI Assistant</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <FiCheck className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">Priority support</span>
                  </li>
                </ul>
                
                <form
                  action={async () => {
                    "use server"
                    await signIn("google", { redirectTo: "/contacts" })
                  }}
                >
                  <button
                    type="submit"
                    className="w-full py-3 px-6 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40"
                  >
                    Get Started
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Open Source Section */}
      <section className="py-20 md:py-28 bg-white dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-900 dark:bg-white flex items-center justify-center mx-auto mb-8">
              <FiGithub className="h-8 w-8 text-white dark:text-gray-900" />
            </div>
            
            <h3 className="font-serif-display text-3xl md:text-4xl font-semibold text-gray-900 dark:text-white mb-6">
              Own your data
            </h3>
            
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
              Orbit is open source. Self-host it on your own infrastructure for complete control over your data. 
              No vendor lock-in, no privacy concerns—just your relationships, your way.
            </p>
            
            <a
              href={LINKS.github}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-8 py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-lg font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all"
            >
              <FiGithub className="h-5 w-5" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-gray-50 dark:bg-slate-950 border-t border-gray-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-indigo-600">Orbit</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">© {new Date().getFullYear()}</span>
            </div>
            
            <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
              <Link href="/privacy" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                Terms of Service
              </Link>
              <a
                href={LINKS.github}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
