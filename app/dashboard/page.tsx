import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/header"
import { AssignmentsList } from "@/components/assignments-list"

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user) {
    redirect("/auth/login")
  }

  return (
    <div className="min-h-screen bg-background">
      <Header user={data.user} />
      <main className="w-full py-6 px-6 md:px-10 lg:px-16">
        <AssignmentsList />
      </main>
    </div>
  )
}
