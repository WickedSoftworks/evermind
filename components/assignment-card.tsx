"use client"

import { lazy, Suspense } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Calendar, CheckCircle2, Clock, MoreVertical, Pencil, Trash2 } from "lucide-react"
import type { Assignment } from "@/lib/types"
import { dueDateLabel, isAssignmentOverdue, parseDueDate } from "@/lib/dates"
import { useTimeZone } from "@/components/timezone-provider"
import { useSWRConfig } from "swr"
import { useState } from "react"

// Dynamically import the dialog - only loads when user clicks edit
const EditAssignmentDialog = lazy(() => 
  import("./edit-assignment-dialog").then(mod => ({ default: mod.EditAssignmentDialog }))
)

interface AssignmentCardProps {
  assignment: Assignment
  isPreview?: boolean
  onPreviewStatusChange?: (id: string, status: "pending" | "completed") => void
  onPreviewDelete?: (id: string) => void
}

export function AssignmentCard({
  assignment,
  isPreview = false,
  onPreviewStatusChange,
  onPreviewDelete,
}: AssignmentCardProps) {
  const { mutate } = useSWRConfig()
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const timeZone = useTimeZone()

  const priorityColors = {
    low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
    high: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
  }

  const statusColors = {
    pending: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
    overdue: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
  }

  const dueDate = parseDueDate(assignment.due_date)
  const isOverdue = isAssignmentOverdue(assignment)

  const handleComplete = async () => {
    if (isPreview) {
      onPreviewStatusChange?.(assignment.id, "completed")
      return
    }
    const supabase = createClient()
    await supabase
      .from("assignments")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", assignment.id)
    mutate("assignments")
  }

  const handleDelete = async () => {
    if (isPreview) {
      onPreviewDelete?.(assignment.id)
      return
    }
    const supabase = createClient()
    await supabase.from("assignments").delete().eq("id", assignment.id)
    mutate("assignments")
  }

  const handleReopen = async () => {
    if (isPreview) {
      onPreviewStatusChange?.(assignment.id, "pending")
      return
    }
    const supabase = createClient()
    await supabase
      .from("assignments")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("id", assignment.id)
    mutate("assignments")
  }

  return (
    <Card className={assignment.status === "completed" ? "opacity-60" : ""}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex flex-col gap-1 flex-1 min-w-0 pr-2">
          <CardTitle
            className={`text-base font-semibold truncate ${assignment.status === "completed" ? "line-through" : ""}`}
          >
            {assignment.title}
          </CardTitle>
          <p className="text-sm text-muted-foreground truncate">{assignment.subject}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!isPreview && (
              <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
            )}
            {assignment.status !== "completed" ? (
              <DropdownMenuItem onClick={handleComplete}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mark complete
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={handleReopen}>
                <Clock className="mr-2 h-4 w-4" />
                Reopen
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        {assignment.description && (
          <p className="mb-3 text-sm text-muted-foreground line-clamp-2">{assignment.description}</p>
        )}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className={`text-xs ${priorityColors[assignment.priority]}`}>
              {assignment.priority}
            </Badge>
            <Badge
              variant="secondary"
              className={`text-xs ${isOverdue ? statusColors.overdue : statusColors[assignment.status]}`}
            >
              {isOverdue ? "overdue" : assignment.status}
            </Badge>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {dueDateLabel(dueDate, timeZone)}
          </div>
        </div>
      </CardContent>
      
      {!isPreview && editDialogOpen && (
        <Suspense fallback={null}>
          <EditAssignmentDialog
            assignment={assignment}
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
          />
        </Suspense>
      )}
    </Card>
  )
}
