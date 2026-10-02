"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type React from "react";
import { useId, useState } from "react";
import { ClassCombobox } from "@/components/class-combobox";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AssignmentDraft } from "@/lib/data/assignments";
import type { Assignment, Priority } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The assignment form, once.
 *
 * There used to be three copies of this — add, edit and the preview-mode add —
 * differing only in what they did with the result. They had already drifted, and
 * every field the schema grows would have had to be written into all three.
 *
 * The form owns its field state and hands the caller a finished
 * `AssignmentDraft`. It renders inside a `DialogContent`, which Radix unmounts
 * on close, so each open starts from `initialValues` without anyone having to
 * synchronise state in an effect.
 */

export interface AssignmentFormValues {
  title: string;
  subject: string;
  description: string;
  dueDate: Date | undefined;
  dueTime: string;
  priority: Priority;
}

/** 23:59 rather than midnight: "due Friday" almost always means the end of Friday. */
export function emptyAssignmentForm(): AssignmentFormValues {
  return { title: "", subject: "", description: "", dueDate: undefined, dueTime: "23:59", priority: "medium" };
}

export function assignmentToForm(assignment: Assignment): AssignmentFormValues {
  const due = new Date(assignment.due_date);

  return {
    title: assignment.title,
    subject: assignment.subject,
    description: assignment.description ?? "",
    dueDate: due,
    dueTime: format(due, "HH:mm"),
    priority: assignment.priority,
  };
}

interface FieldErrors {
  subject?: string;
  dueDate?: string;
}

interface AssignmentFormProps {
  initialValues: AssignmentFormValues;
  /**
   * Passed in rather than read from `useSubjectOptions()` here. That hook is
   * SWR over Supabase, and this same form renders on `/preview`, which is signed
   * out — calling it there would fire requests that can only fail.
   */
  subjectOptions: string[];
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
  /**
   * Awaited, so it may be sync or async. The form does not act on the result:
   * whether the dialog closes is the caller's decision, because only the caller
   * knows whether the write landed — closing regardless is what used to make a
   * rejected write look like a saved one.
   */
  onSubmit: (draft: AssignmentDraft) => unknown;
}

export function AssignmentForm({
  initialValues,
  subjectOptions,
  submitLabel,
  pendingLabel,
  isPending,
  onSubmit,
}: AssignmentFormProps) {
  // Unique per instance. The three dialogs all hardcoded id="title", id="subject"
  // and so on, so opening the edit dialog while the add dialog existed put
  // duplicate ids in the document and every label pointed at whichever came
  // first.
  const fieldId = useId();
  const id = (name: string) => `${fieldId}-${name}`;

  const [values, setValues] = useState<AssignmentFormValues>(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});

  const set = <K extends keyof AssignmentFormValues>(key: K, value: AssignmentFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    // Clearing on edit rather than re-validating on every keystroke: the message
    // has been read and acted on, and re-asserting it while someone types is
    // noise.
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // Subject and due date cannot be `required` inputs — one is a combobox, the
    // other a popover — so they are checked here. This used to be a bare
    // `return`: submitting an incomplete form did nothing at all, with no
    // message, no focus move, and no indication which field was the problem.
    const found: FieldErrors = {};
    if (!values.subject.trim()) found.subject = "Choose or type a class for this assignment.";
    if (!values.dueDate) found.dueDate = "Pick the date this is due.";

    if (found.subject || found.dueDate) {
      setErrors(found);
      document.getElementById(id(found.subject ? "subject" : "due-date"))?.focus();
      return;
    }

    // Non-null: `values.dueDate` was just checked.
    const [hours, minutes] = values.dueTime.split(":");
    const due = new Date(values.dueDate as Date);
    due.setHours(Number.parseInt(hours, 10), Number.parseInt(minutes, 10), 0, 0);

    await onSubmit({
      title: values.title,
      subject: values.subject,
      description: values.description || null,
      due_date: due.toISOString(),
      priority: values.priority,
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate={false}>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor={id("title")}>Title</Label>
          <Input
            id={id("title")}
            placeholder="Math Homework Chapter 5"
            value={values.title}
            onChange={(e) => set("title", e.target.value)}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={id("subject")}>Subject</Label>
          <ClassCombobox
            id={id("subject")}
            value={values.subject}
            onValueChange={(value) => set("subject", value)}
            options={subjectOptions}
            invalid={Boolean(errors.subject)}
            describedBy={errors.subject ? id("subject-error") : undefined}
          />
          {errors.subject && (
            <p id={id("subject-error")} role="alert" className="text-sm text-destructive">
              {errors.subject}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor={id("description")}>Description (optional)</Label>
          <Textarea
            id={id("description")}
            placeholder="Complete exercises 1-20..."
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            // It grows with its text, and a pasted or imported description is
            // long enough to push the save button off the bottom of the form.
            className="max-h-60"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            {/* htmlFor and a matching id on the trigger. The label used to have
                neither, so clicking it did nothing and it was announced as a
                stray piece of text. */}
            <Label htmlFor={id("due-date")}>Due Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id={id("due-date")}
                  type="button"
                  variant="outline"
                  aria-invalid={Boolean(errors.dueDate) || undefined}
                  aria-describedby={errors.dueDate ? id("due-date-error") : undefined}
                  className={cn(
                    "justify-start text-left font-normal",
                    !values.dueDate && "text-muted-foreground",
                    errors.dueDate && "border-destructive",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {values.dueDate ? format(values.dueDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={values.dueDate}
                  onSelect={(date) => set("dueDate", date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {errors.dueDate && (
              <p id={id("due-date-error")} role="alert" className="text-sm text-destructive">
                {errors.dueDate}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={id("due-time")}>Due Time</Label>
            <Input
              id={id("due-time")}
              type="time"
              value={values.dueTime}
              onChange={(e) => set("dueTime", e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={id("priority")}>Priority</Label>
          <Select value={values.priority} onValueChange={(v) => set("priority", v as Priority)}>
            {/* The id belongs on the trigger, which is what the label points at.
                It used to be absent, so the association was dead. */}
            <SelectTrigger id={id("priority")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
