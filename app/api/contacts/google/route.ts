import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get the user's Google account with access token
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "google",
      },
      select: {
        access_token: true,
        refresh_token: true,
        expires_at: true,
      },
    })

    if (!account?.access_token) {
      return NextResponse.json(
        { error: "Google account not connected or no access token available" },
        { status: 400 }
      )
    }

    // Check if token is expired and refresh if needed
    let accessToken = account.access_token
    if (account.expires_at && account.expires_at * 1000 < Date.now()) {
      // Token is expired, try to refresh
      if (!account.refresh_token) {
        return NextResponse.json(
          { error: "Access token expired and no refresh token available. Please reconnect your Google account." },
          { status: 400 }
        )
      }

      const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.AUTH_GOOGLE_ID!,
          client_secret: process.env.AUTH_GOOGLE_SECRET!,
          refresh_token: account.refresh_token,
          grant_type: "refresh_token",
        }),
      })

      if (!refreshResponse.ok) {
        return NextResponse.json(
          { error: "Failed to refresh access token. Please reconnect your Google account." },
          { status: 400 }
        )
      }

      const tokens = await refreshResponse.json()
      accessToken = tokens.access_token

      // Update the access token in the database
      await prisma.account.update({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: (await prisma.account.findFirst({
              where: { userId: session.user.id, provider: "google" },
              select: { providerAccountId: true },
            }))!.providerAccountId,
          },
        },
        data: {
          access_token: tokens.access_token,
          expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
        },
      })
    }

    // Fetch contacts from Google People API with pagination support
    const allContacts: any[] = []
    let nextPageToken: string | undefined = undefined
    
    do {
      const url = new URL("https://people.googleapis.com/v1/people/me/connections")
      url.searchParams.set("personFields", "names,emailAddresses,phoneNumbers,birthdays,organizations,addresses,biographies,photos")
      url.searchParams.set("pageSize", "1000") // Maximum allowed by Google API
      if (nextPageToken) {
        url.searchParams.set("pageToken", nextPageToken)
      }

      const contactsResponse = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!contactsResponse.ok) {
        const error = await contactsResponse.text()
        console.error("Google API error:", error)
        return NextResponse.json(
          { error: "Failed to fetch contacts from Google" },
          { status: 500 }
        )
      }

      const data = await contactsResponse.json()
      
      // Add contacts from this page
      if (data.connections) {
        allContacts.push(...data.connections)
      }
      
      // Get the next page token for pagination
      nextPageToken = data.nextPageToken
      
    } while (nextPageToken) // Continue until no more pages
    
    // Transform Google contacts to our format
    const contacts = allContacts.map((person: any) => {
      const name = person.names?.[0]?.displayName || "Unknown"
      const email = person.emailAddresses?.[0]?.value || null
      const phone = person.phoneNumbers?.[0]?.value || null
      const organization = person.organizations?.[0]
      const company = organization?.name || null
      const jobTitle = organization?.title || null
      const address = person.addresses?.[0]
      const location = address ? [address.city, address.region, address.country].filter(Boolean).join(", ") : null
      const bio = person.biographies?.[0]?.value || null
      const birthday = person.birthdays?.[0]
      const dateOfBirth = birthday?.date ? 
        `${birthday.date.year || "1900"}-${String(birthday.date.month || 1).padStart(2, "0")}-${String(birthday.date.day || 1).padStart(2, "0")}` : 
        null
      const photoUrl = person.photos?.[0]?.url || null

      return {
        displayName: name,
        primaryEmail: email,
        primaryPhone: phone,
        company,
        jobTitle,
        location,
        notes: bio,
        dateOfBirth,
        photoUrl,
      }
    })

    return NextResponse.json({ contacts })
  } catch (error) {
    console.error("Error fetching Google contacts:", error)
    return NextResponse.json(
      { error: "An error occurred while fetching contacts" },
      { status: 500 }
    )
  }
}

