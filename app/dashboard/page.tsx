import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { fetchDashboardData } from "@/lib/data/dashboard"
import { Header } from "@/components/header"
import { AssignmentsList } from "@/components/assignments-list"
import { Loader2 } from "lucide-react"

export const dynamic = 'force-dynamic'

// Loading component for the assignments list
function AssignmentsLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  
  // Fetch user auth and dashboard data in parallel using Promise.all
  const [userResult, ] = await Promise.all([
    supabase.auth.getUser(),
    // Add more parallel auth/config fetches here if needed
  ])

  const { data, error } = userResult

  if (error || !data?.user) {
    redirect("/auth/login")
  }

  // Fetch dashboard data (assignments, etc.) - uses Promise.all internally
  const dashboardData = await fetchDashboardData(data.user.id)

  return (
    <div className="min-h-screen bg-background">
      <Header user={data.user} />
      <main className="w-full py-6 px-6 md:px-10 lg:px-16">
        <Suspense fallback={<AssignmentsLoading />}>
          {/* Pass server-fetched data for instant hydration */}
          <AssignmentsList initialData={dashboardData.assignments} />
        </Suspense>
      </main>
    </div>
  )
}
