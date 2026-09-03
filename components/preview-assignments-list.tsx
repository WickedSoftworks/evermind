"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AssignmentCard } from "@/components/assignment-card"
import { StatsCards } from "@/components/stats-cards"
import { WeeklyView } from "@/components/weekly-view"
import { PreviewAddAssignmentDialog } from "@/components/preview-add-assignment-dialog"
import type { Assignment } from "@/lib/types"
import { isAssignmentOverdue, isAssignmentPending } from "@/lib/dates"

export function PreviewAssignmentsList({ initialAssignments }: { initialAssignments: Assignment[] }) {
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments)

  const handleAddAssignment = (newAssignment: Assignment) => {
    setAssignments((prev) => [newAssignment, ...prev])
  }

  const handleStatusChange = (id: string, newStatus: "pending" | "completed") => {
    setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a)))
  }

  const handleDelete = (id: string) => {
    setAssignments((prev) => prev.filter((a) => a.id !== id))
  }

  const allAssignments = assignments
  const pendingAssignments = allAssignments.filter((a) => isAssignmentPending(a))
  const completedAssignments = allAssignments.filter((a) => a.status === "completed")
  const overdueAssignments = allAssignments.filter((a) => isAssignmentOverdue(a))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Track your assignments and never miss a deadline</p>
        </div>
        <PreviewAddAssignmentDialog onAdd={handleAddAssignment} />
      </div>

      <div className="rounded-lg border border-dashed border-primary/50 bg-primary/5 p-3 text-center text-sm text-primary">
        {"Preview Mode - Changes won't be saved. Sign in with an account to persist your data."}
      </div>

      <StatsCards assignments={allAssignments} />

      <WeeklyView assignments={allAssignments} />

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="pending">Pending ({pendingAssignments.length})</TabsTrigger>
          <TabsTrigger value="overdue">Overdue ({overdueAssignments.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completedAssignments.length})</TabsTrigger>
          <TabsTrigger value="all">All ({allAssignments.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4">
          <AssignmentsGrid
            assignments={pendingAssignments}
            emptyMessage="No pending assignments"
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
          />
        </TabsContent>
        <TabsContent value="overdue" className="mt-4">
          <AssignmentsGrid
            assignments={overdueAssignments}
            emptyMessage="No overdue assignments - great job!"
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
          />
        </TabsContent>
        <TabsContent value="completed" className="mt-4">
          <AssignmentsGrid
            assignments={completedAssignments}
            emptyMessage="No completed assignments yet"
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
          />
        </TabsContent>
        <TabsContent value="all" className="mt-4">
          <AssignmentsGrid
            assignments={allAssignments}
            emptyMessage="No assignments yet"
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AssignmentsGrid({
  assignments,
  emptyMessage,
  onStatusChange,
  onDelete,
}: {
  assignments: Assignment[]
  emptyMessage: string
  onStatusChange: (id: string, status: "pending" | "completed") => void
  onDelete: (id: string) => void
}) {
  if (assignments.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-muted/50">
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {assignments.map((assignment) => (
        <AssignmentCard
          key={assignment.id}
          assignment={assignment}
          isPreview
          onPreviewStatusChange={onStatusChange}
          onPreviewDelete={onDelete}
        />
      ))}
    </div>
  )
}
