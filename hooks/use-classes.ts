"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import type { Assignment, Class } from "@/lib/types";

/** SWR cache keys. Shared with anything that mutates these tables. */
export const CLASSES_KEY = "classes";
const ASSIGNMENTS_KEY = "assignments";

async function fetchAssignments(): Promise<Assignment[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("assignments").select("*").order("due_date", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function fetchClasses(): Promise<Class[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("classes").select("*").order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

/** The student's saved classes. Call `mutate(CLASSES_KEY)` after writing one. */
export function useClasses() {
  return useSWR(CLASSES_KEY, fetchClasses);
}

/**
 * Every subject worth offering in the picker: saved classes first, then any
 * other subject already used on an assignment.
 *
 * The suggestions matter most on day one, when nothing has been saved yet and a
 * list built only from `classes` would be empty. They are read-only — a subject
 * is promoted into a real class from Settings, never silently on use.
 *
 * Sharing the dashboard's SWR key means the dialog reads rows already in
 * cache; Settings, which never lists assignments itself, fetches them once.
 */
export function useSubjectOptions(): string[] {
  const { data: classes } = useClasses();
  const { data: assignments } = useSWR(ASSIGNMENTS_KEY, fetchAssignments);

  const seen = new Set<string>();
  const options: string[] = [];

  for (const name of classes?.map((c) => c.name) ?? []) {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    options.push(name);
  }

  // Saved spelling wins, so a class saved as "Chemistry" is not shadowed by an
  // older assignment filed under "chemistry".
  for (const subject of assignments?.map((a) => a.subject) ?? []) {
    const key = subject?.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    options.push(subject);
  }

  return options;
}

/**
 * Subjects already used on assignments that are not saved as classes yet.
 *
 * Settings offers these as one-click additions, which is how a list built by
 * Canvas import — or by typing "Chemistry" twelve times — becomes a real one.
 */
export function useUnsavedSubjects(): string[] {
  const { data: classes } = useClasses();
  const { data: assignments } = useSWR(ASSIGNMENTS_KEY, fetchAssignments);

  const saved = new Set((classes ?? []).map((c) => c.name.trim().toLowerCase()));
  const seen = new Set<string>();
  const unsaved: string[] = [];

  for (const subject of assignments?.map((a) => a.subject) ?? []) {
    const key = subject?.trim().toLowerCase();
    if (!key || saved.has(key) || seen.has(key)) continue;
    seen.add(key);
    unsaved.push(subject.trim());
  }

  return unsaved.sort((a, b) => a.localeCompare(b));
}
