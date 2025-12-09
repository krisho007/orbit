import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/app-shell"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  
  if (!session) {
    redirect('/')
  }

  return <AppShell session={session}>{children}</AppShell>
}


