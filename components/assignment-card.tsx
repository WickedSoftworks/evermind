"use client";

import { Calendar, CheckCircle2, Clock, Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useSWRConfig } from "swr";
import { useTimeZone } from "@/components/timezone-provider";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAssignmentMutation } from "@/hooks/use-assignment-mutation";
import { AssignmentWriteError, deleteAssignment, setAssignmentStatus } from "@/lib/data/assignments";
import { dueDateLabel, isAssignmentOverdue, parseDueDate } from "@/lib/dates";
import type { Assignment } from "@/lib/types";

// Dynamically import the dialog - only loads when user clicks edit
const EditAssignmentDialog = lazy(() =>
  import("./edit-assignment-dialog").then((mod) => ({ default: mod.EditAssignmentDialog })),
);

interface AssignmentCardProps {
  assignment: Assignment;
  isPreview?: boolean;
  onPreviewStatusChange?: (id: string, status: "pending" | "completed") => void;
  onPreviewDelete?: (id: string) => void;
}

export function AssignmentCard({
  assignment,
  isPreview = false,
  onPreviewStatusChange,
  onPreviewDelete,
}: AssignmentCardProps) {
  const { mutate } = useSWRConfig();
  const { runMutation } = useAssignmentMutation();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const timeZone = useTimeZone();

  const priorityColors = {
    low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
    high: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
  };

  const statusColors = {
    pending: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
    overdue: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
  };

  const dueDate = parseDueDate(assignment.due_date);
  const isOverdue = isAssignmentOverdue(assignment);

  const handleComplete = async () => {
    if (isPreview) {
      onPreviewStatusChange?.(assignment.id, "completed");
      return;
    }
    await runMutation(() => setAssignmentStatus(assignment.id, "completed"), "Could not mark this complete");
  };

  const handleDelete = async () => {
    if (isPreview) {
      onPreviewDelete?.(assignment.id);
      setDeleteDialogOpen(false);
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteAssignment(assignment.id);
    } catch (error) {
      // Deleting used to be fire-and-forget, so a failure just left the card
      // sitting there. The message goes inline rather than into a toast because
      // the dialog it belongs to is still open in front of it.
      setDeleteError(
        error instanceof AssignmentWriteError ? error.message : "Could not delete this assignment. Please try again.",
      );
      return;
    } finally {
      setIsDeleting(false);
    }

    setDeleteDialogOpen(false);
    mutate("assignments");
  };

  const handleDeleteDialogChange = (next: boolean) => {
    if (isDeleting) return;
    setDeleteDialogOpen(next);
    setDeleteError(null);
  };

  const handleReopen = async () => {
    if (isPreview) {
      onPreviewStatusChange?.(assignment.id, "pending");
      return;
    }
    await runMutation(() => setAssignmentStatus(assignment.id, "pending"), "Could not reopen this assignment");
  };

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
            <DropdownMenuItem onClick={() => setDeleteDialogOpen(true)} className="text-destructive">
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

      {/* Kept outside the dropdown: Radix unmounts the menu content when the menu
          closes, which would tear down a dialog nested inside it. */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{assignment.title}</span> will be permanently deleted. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={isDeleting} onClick={handleDelete}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!isPreview && editDialogOpen && (
        <Suspense fallback={null}>
          <EditAssignmentDialog assignment={assignment} open={editDialogOpen} onOpenChange={setEditDialogOpen} />
        </Suspense>
      )}
    </Card>
  );
}
