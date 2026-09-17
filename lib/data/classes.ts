/**
 * Matching a typed subject to a saved class.
 *
 * `assignments.subject` is free text and always has been — a person can type
 * anything into the picker, and most of what they type has no saved class behind
 * it on the day they type it. `assignments.class_id` is the link where there is
 * one to make, and this is the one place that decides whether there is.
 *
 * The rule is the same one `useSubjectOptions` already uses to decide two names
 * are the same name: trimmed, lowercased, compared exactly. Keeping it here
 * rather than inline in the form means the picker, the writer and the migration's
 * backfill all agree — and they have to, or an assignment saved from the form
 * would be linked while the identical row imported from a file was not.
 */

/** Just enough of a class row to match against, so this couples to nothing. */
export interface MatchableClass {
  readonly id: string;
  readonly name: string;
}

export function resolveClassId(subject: string, classes: readonly MatchableClass[] | undefined): string | null {
  const wanted = subject.trim().toLowerCase();

  // An empty subject cannot match anything, and `find` on "" would match a class
  // whose name is only whitespace — which the manager does not allow, but which
  // is not worth relying on.
  if (!wanted) return null;

  return classes?.find((candidate) => candidate.name.trim().toLowerCase() === wanted)?.id ?? null;
}
