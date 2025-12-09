import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth

  // Public routes
  const isPublicRoute = pathname === '/' || pathname.startsWith('/api/auth')

  // Redirect logged in users from home to /contacts
  if (isLoggedIn && pathname === '/') {
    return NextResponse.redirect(new URL('/contacts', req.url))
  }

  // Redirect non-logged in users to home
  if (!isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}


