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
  /**
   * The saved class this belongs to, where the subject matches one.
   *
   * Optional rather than required, and the reason is the Canvas importer: it
   * produces drafts from a file and has no list of saved classes to match
   * against, so demanding this would mean either threading the classes into the
   * parser or writing `class_id: null` in a place that has no opinion about it.
   * The surfaces that *do* know — the add and edit forms — set it through
   * `resolveClassId`, and everything else leaves the column alone.
   */
  class_id?: string | null;
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

/**
 * Insert many at once, for the Canvas import.
 *
 * Its own function rather than a loop over `createAssignment`: one round trip
 * instead of N, and one `auth.getUser()` instead of N. More to the point, the
 * import used to call `supabase.from("assignments").insert(...)` itself, which
 * meant it had its own error handling, its own message wording, and took the
 * user id from a prop rather than the session — so a session that expired while
 * the preview dialog was open wrote rows under a stale id, or tried to.
 *
 * All or nothing: PostgREST rejects the whole array if any row violates a
 * constraint. That is the right shape for an import the user has just reviewed
 * and confirmed — a partial import leaves them with no way to tell which half
 * landed.
 */
export async function createAssignments(drafts: AssignmentDraft[]): Promise<void> {
  if (drafts.length === 0) return;

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AssignmentWriteError("Your session has expired, so we could not import these. Sign in again.");
  }

  const { error } = await supabase.from("assignments").insert(
    drafts.map((draft) => ({
      ...draft,
      user_id: user.id,
      status: "pending" satisfies Status,
    })),
  );

  assertWritten(error, drafts.length === 1 ? "import this assignment" : "import these assignments");
}

export async function updateAssignment(id: string, patch: Partial<AssignmentDraft>): Promise<void> {
  const supabase = createClient();

  // `updated_at` is deliberately absent: the `handle_updated_at` trigger sets it
  // (scripts/004). A timestamp the client sends is one the client can falsify,
  // and one that every write path has to remember — which is how the Canvas
  // import ended up not setting it at all.
  const { error } = await supabase.from("assignments").update(patch).eq("id", id);

  assertWritten(error, "save your changes");
}

export async function setAssignmentStatus(id: string, status: Status): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.from("assignments").update({ status }).eq("id", id);

  assertWritten(error, status === "completed" ? "mark this complete" : "reopen this assignment");
}

export async function deleteAssignment(id: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.from("assignments").delete().eq("id", id);

  assertWritten(error, "delete this assignment");
}
