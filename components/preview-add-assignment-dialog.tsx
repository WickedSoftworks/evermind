"use client";

import { format } from "date-fns";
import { CalendarIcon, Clock, Plus } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { ClassCombobox } from "@/components/class-combobox";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Assignment, Priority } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The demo data on the preview page uses these, so the picker has something to show. */
const PREVIEW_SUBJECTS = ["Mathematics", "History", "Physics", "English", "Chemistry", "Art"];

interface PreviewAddAssignmentDialogProps {
  onAdd: (assignment: Assignment) => void;
}

export function PreviewAddAssignmentDialog({ onAdd }: PreviewAddAssignmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [dueTime, setDueTime] = useState("23:59");
  const [priority, setPriority] = useState<Priority>("medium");
  const [calendarOpen, setCalendarOpen] = useState(false);

  const resetForm = () => {
    setTitle("");
    setSubject("");
    setDescription("");
    setDueDate(undefined);
    setDueTime("23:59");
    setPriority("medium");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!dueDate || !subject.trim()) return;

    const [hours, minutes] = dueTime.split(":").map(Number);
    const combinedDate = new Date(dueDate);
    combinedDate.setHours(hours, minutes, 0, 0);

    const newAssignment: Assignment = {
      id: `preview-${Date.now()}`,
      user_id: "preview-user",
      title,
      subject,
      description: description || null,
      due_date: combinedDate.toISOString(),
      priority,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    onAdd(newAssignment);
    resetForm();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Assignment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Assignment</DialogTitle>
          <DialogDescription>{"Preview mode - this assignment won't be saved permanently."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Math Homework Chapter 5"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="subject">Subject</Label>
              <ClassCombobox id="subject" value={subject} onValueChange={setSubject} options={PREVIEW_SUBJECTS} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="Complete exercises 1-20..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Due Date</Label>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("justify-start text-left font-normal", !dueDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dueDate ? format(dueDate, "MMM d, yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={(date) => {
                        setDueDate(date);
                        setCalendarOpen(false);
                      }}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="due-time">Due Time</Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="due-time"
                    type="time"
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger>
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
            <Button type="submit" disabled={!dueDate}>
              Add Assignment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
