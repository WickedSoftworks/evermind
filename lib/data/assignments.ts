import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Priority, Status } from "@/lib/types";

/**
 * Every write to the `assignments` table, in one place.
 *
 * Supabase's client does not throw on failure — it resolves with `{ error }`. That
 * makes the wrong thing (ignoring the result) the shortest thing to write, which is
 * how six call sites ended up reporting success for writes that never landed. These
 * functions throw instead, so a caller has to opt out of correctness rather than into
 * it. Pair them with `useAssignmentMutation`, which turns the throw into a toast.
 */

/** A write that did not land. `message` is safe to show to the user. */
export class AssignmentWriteError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AssignmentWriteError";
    this.cause = cause;
  }
}

/** The fields a user actually fills in. `user_id`, `status` and timestamps are ours. */
export interface AssignmentDraft {
  title: string;
  subject: string;
  description: string | null;
  due_date: string;
  priority: Priority;
}

/**
 * Turns a Postgrest error into something worth reading. The distinctions that matter
 * to a user are "you are offline", "you are signed out" and "we cannot say" — the raw
 * message is useful for none of them, so it only goes to the console.
 */
function describe(error: PostgrestError, action: string): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return `You appear to be offline, so we could not ${action}. It has not been saved.`;
  }

  // supabase-js reports a failed fetch with an empty code rather than an HTTP status.
  if (!error.code || error.message === "Failed to fetch") {
    return `We could not reach the server, so we could not ${action}. It has not been saved.`;
  }

  // PGRST301: the JWT expired or was rejected. 42501: row-level security said no,
  // which for a signed-out or mis-scoped session looks the same to the user.
  if (error.code === "PGRST301" || error.code === "42501") {
    return `Your session has expired, so we could not ${action}. Sign in again and retry.`;
  }

  return `We could not ${action}. It has not been saved.`;
}

/** @throws AssignmentWriteError if the write did not land. */
function assertWritten(error: PostgrestError | null, action: string): void {
  if (!error) return;
  console.error(`Could not ${action}:`, error);
  throw new AssignmentWriteError(describe(error, action), error);
}

export async function createAssignment(draft: AssignmentDraft): Promise<void> {
  const supabase = createClient();

  // Read rather than trusted from a prop: RLS checks this server-side anyway, and a
  // missing user here means the session went away between opening the form and saving.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AssignmentWriteError("Your session has expired, so we could not add this assignment. Sign in again.");
  }

  const { error } = await supabase.from("assignments").insert({
    ...draft,
    user_id: user.id,
    status: "pending" satisfies Status,
  });

  assertWritten(error, "add this assignment");
}

export async function updateAssignment(id: string, patch: Partial<AssignmentDraft>): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("assignments")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);

  assertWritten(error, "save your changes");
}

export async function setAssignmentStatus(id: string, status: Status): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("assignments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  assertWritten(error, status === "completed" ? "mark this complete" : "reopen this assignment");
}

export async function deleteAssignment(id: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.from("assignments").delete().eq("id", id);

  assertWritten(error, "delete this assignment");
}
