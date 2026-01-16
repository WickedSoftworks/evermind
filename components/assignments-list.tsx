"use client"

import { createClient } from "@/lib/supabase/client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AssignmentCard } from "@/components/assignment-card"
import { StatsCards } from "@/components/stats-cards"
import { WeeklyView } from "@/components/weekly-view"
import { AddAssignmentDialog } from "@/components/add-assignment-dialog"
import type { Assignment } from "@/lib/types"
import { isPast } from "date-fns"
import useSWR from "swr"
import { Loader2 } from "lucide-react"

async function fetchAssignments(): Promise<Assignment[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from("assignments").select("*").order("due_date", { ascending: true })

  if (error) throw error
  return data || []
}

export function AssignmentsList() {
  const { data: assignments, error, isLoading } = useSWR("assignments", fetchAssignments)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load assignments</p>
      </div>
    )
  }

  const allAssignments = assignments || []
  const pendingAssignments = allAssignments.filter((a) => a.status === "pending" && !isPast(new Date(a.due_date)))
  const completedAssignments = allAssignments.filter((a) => a.status === "completed")
  const overdueAssignments = allAssignments.filter((a) => a.status !== "completed" && isPast(new Date(a.due_date)))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Track your assignments and never miss a deadline</p>
        </div>
        <AddAssignmentDialog />
      </div>

      <StatsCards assignments={allAssignments} />

      <WeeklyView assignments={allAssignments} />

      <Tabs defaultValue="pending" className="w-full">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pendingAssignments.length})</TabsTrigger>
          <TabsTrigger value="overdue">Overdue ({overdueAssignments.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completedAssignments.length})</TabsTrigger>
          <TabsTrigger value="all">All ({allAssignments.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4">
          <AssignmentsGrid assignments={pendingAssignments} emptyMessage="No pending assignments" />
        </TabsContent>
        <TabsContent value="overdue" className="mt-4">
          <AssignmentsGrid assignments={overdueAssignments} emptyMessage="No overdue assignments - great job!" />
        </TabsContent>
        <TabsContent value="completed" className="mt-4">
          <AssignmentsGrid assignments={completedAssignments} emptyMessage="No completed assignments yet" />
        </TabsContent>
        <TabsContent value="all" className="mt-4">
          <AssignmentsGrid assignments={allAssignments} emptyMessage="No assignments yet" />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AssignmentsGrid({
  assignments,
  emptyMessage,
}: {
  assignments: Assignment[]
  emptyMessage: string
}) {
  if (assignments.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-muted/50">
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {assignments.map((assignment) => (
        <AssignmentCard key={assignment.id} assignment={assignment} />
      ))}
    </div>
  )
}
