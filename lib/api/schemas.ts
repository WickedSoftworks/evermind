import { z } from "zod";

/**
 * What the `/api` layer will accept, mirroring what the database will accept.
 *
 * These limits are not the enforcement — the CHECK constraints in
 * `supabase/migrations/20260904120100_tighten_column_constraints.sql` are, and
 * they have to be, because the browser still writes to PostgREST directly for
 * everything that has not moved behind a route yet. What these add is a
 * readable refusal: Postgres answers a violated constraint with
 * `new row for relation "assignments" violates check constraint
 * "assignments_title_length"`, which is not a sentence to show anybody.
 *
 * **If you change a limit here, change the migration too.** They are two
 * statements of one rule, and the database's copy is the one that counts.
 */

/** `assignments_priority_check`. */
export const prioritySchema = z.enum(["low", "medium", "high"]);

/** `assignments_status_check`. There is no 'overdue' — it is derived from `due_date`. */
export const statusSchema = z.enum(["pending", "completed"]);

/**
 * A timestamp Postgres will accept into `timestamptz`.
 *
 * Deliberately not `z.iso.datetime()`: the form sends `new Date().toISOString()`,
 * but an importer or a script may reasonably send an offset like
 * `2026-09-09T17:00:00+01:00`, which is a valid instant and which the stricter
 * schema rejects for ending in something other than `Z`.
 */
const timestamp = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), "must be a date and time, such as 2026-09-09T17:00:00Z");

/** The fields a user fills in. `user_id`, `status` and the timestamps are the server's. */
export const assignmentDraftSchema = z.object({
  title: z.string().trim().min(1, "cannot be empty").max(300, "must be 300 characters or fewer"),
  subject: z.string().trim().min(1, "cannot be empty").max(200, "must be 200 characters or fewer"),
  description: z
    .string()
    .max(10_000, "must be 10000 characters or fewer")
    .nullish()
    // An absent description and an empty one both mean "none". Normalising here
    // keeps `null` as the single representation in the column.
    .transform((value) => (value?.trim() ? value : null)),
  due_date: timestamp,
  priority: prioritySchema,
  /**
   * The saved class this belongs to, where there is one.
   *
   * `nullish`, so a caller may send it, send null, or leave it out entirely —
   * the last being what the Canvas file importer does, since it has no list of
   * classes to match a subject against.
   *
   * Not checked for ownership here, and it does not need to be: the composite
   * foreign key added in `20260916120000_assignment_class_link.sql` references
   * `(id, user_id)` together, so another account's class id is a combination
   * that does not exist and Postgres refuses it.
   */
  class_id: z.uuid("is not a valid id").nullish(),
});

export type AssignmentDraftInput = z.infer<typeof assignmentDraftSchema>;

/**
 * A batch, for the Canvas import.
 *
 * The ceiling is a guard on request size rather than a product limit — a very
 * full semester is a couple of hundred items. All-or-nothing at the database
 * level, so a batch that exceeds it is refused whole rather than half-written.
 */
export const assignmentBatchSchema = z
  .array(assignmentDraftSchema)
  .min(1, "must contain at least one assignment")
  .max(1000, "must contain 1000 assignments or fewer");

/** One assignment, or many. The importer posts an array; the form posts an object. */
export const assignmentCreateSchema = z.union([assignmentDraftSchema, assignmentBatchSchema]);

/**
 * A partial update. `status` is here and not in the draft because it is not a
 * field anyone fills in — it is toggled by the complete/reopen control.
 *
 * `.strict()` matters more than it looks: without it, a client could send
 * `user_id` and PostgREST would happily accept the column into the UPDATE. RLS
 * would still refuse to hand a row to another user, so this is a second lock on
 * a door that is already locked, but the alternative is relying on that alone.
 */
export const assignmentPatchSchema = assignmentDraftSchema
  .partial()
  .extend({ status: statusSchema.optional() })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, "must change at least one field");

export const classDraftSchema = z.object({
  name: z.string().trim().min(1, "cannot be empty").max(200, "must be 200 characters or fewer"),
});

export const classPatchSchema = classDraftSchema
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, "must change at least one field");

/** Route ids are database uuids; anything else cannot match a row and should not cost a query. */
export const idParamSchema = z.object({
  id: z.uuid("is not a valid id"),
});
