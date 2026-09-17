"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { AssignmentForm, emptyAssignmentForm } from "@/components/assignments/assignment-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAssignmentMutation } from "@/hooks/use-assignment-mutation";
import { useClasses, useSubjectOptions } from "@/hooks/use-classes";
import { type AssignmentDraft, createAssignment } from "@/lib/data/assignments";
import { resolveClassId } from "@/lib/data/classes";

export function AddAssignmentDialog() {
  const subjectOptions = useSubjectOptions();
  const { data: classes } = useClasses();
  const { runMutation, isPending } = useAssignmentMutation();
  const [open, setOpen] = useState(false);

  const handleSubmit = async (draft: AssignmentDraft) => {
    // Resolved here rather than inside `AssignmentForm`, which takes only the
    // subject *names* on purpose — that same form renders on `/preview`, signed
    // out, where there are no saved classes to look one up in.
    const linked = { ...draft, class_id: resolveClassId(draft.subject, classes) };
    const saved = await runMutation(() => createAssignment(linked), "Could not add this assignment");

    // Closing regardless is what made a rejected write look like a saved one.
    // Leave the form up with the user's input still in it so they can retry.
    if (saved) setOpen(false);
    return saved;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Assignment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle>Add New Assignment</DialogTitle>
          <DialogDescription>Add a new assignment to track. Fill in the details below.</DialogDescription>
        </DialogHeader>
        <AssignmentForm
          initialValues={emptyAssignmentForm()}
          subjectOptions={subjectOptions}
          submitLabel="Add Assignment"
          pendingLabel="Adding..."
          isPending={isPending}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
