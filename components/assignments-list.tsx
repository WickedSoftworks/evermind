"use client";

import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";
import useSWR from "swr";
import { AssignmentCard } from "@/components/assignment-card";
import { StatsCards } from "@/components/stats-cards";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isAssignmentOverdue, isAssignmentPending } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import type { Assignment } from "@/lib/types";

// Dynamic imports for code splitting - these only load when needed
const WeeklyView = lazy(() => import("@/components/weekly-view").then((mod) => ({ default: mod.WeeklyView })));
const AddAssignmentDialog = lazy(() =>
  import("@/components/add-assignment-dialog").then((mod) => ({ default: mod.AddAssignmentDialog })),
);

// Loading fallbacks
function WeeklyViewSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-6">
      <Skeleton className="h-6 w-32 mb-4" />
      <div className="grid grid-cols-7 gap-2">
        {[...Array(7)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function AddButtonSkeleton() {
  return <Skeleton className="h-10 w-36" />;
}

async function fetchAssignments(): Promise<Assignment[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("assignments").select("*").order("due_date", { ascending: true });

  if (error) throw error;
  return data || [];
}

interface AssignmentsListProps {
  /** Initial data from server-side fetch - skips loading state */
  initialData?: Assignment[];
}

export function AssignmentsList({ initialData }: AssignmentsListProps) {
  // Use SWR with fallbackData for instant hydration from server-prefetched data
  const {
    data: assignments,
    error,
    isLoading,
  } = useSWR("assignments", fetchAssignments, {
    fallbackData: initialData,
    revalidateOnMount: !initialData, // Only revalidate if no initial data
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load assignments</p>
      </div>
    );
  }

  const allAssignments = assignments || [];
  const pendingAssignments = allAssignments.filter((a) => isAssignmentPending(a));
  const completedAssignments = allAssignments.filter((a) => a.status === "completed");
  const overdueAssignments = allAssignments.filter((a) => isAssignmentOverdue(a));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Track your assignments and never miss a deadline</p>
        </div>
        <Suspense fallback={<AddButtonSkeleton />}>
          <AddAssignmentDialog />
        </Suspense>
      </div>

      <StatsCards assignments={allAssignments} />

      <Suspense fallback={<WeeklyViewSkeleton />}>
        <WeeklyView assignments={allAssignments} />
      </Suspense>

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
  );
}

function AssignmentsGrid({ assignments, emptyMessage }: { assignments: Assignment[]; emptyMessage: string }) {
  if (assignments.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-muted/50">
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {assignments.map((assignment) => (
        <AssignmentCard key={assignment.id} assignment={assignment} />
      ))}
    </div>
  );
}
