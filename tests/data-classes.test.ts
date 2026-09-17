import { describe, expect, test } from "bun:test";
import { type MatchableClass, resolveClassId } from "@/lib/data/classes";

/**
 * Matching a typed subject to a saved class.
 *
 * Small, and worth testing carefully anyway, because three separate things have
 * to agree about it: this function, the picker in `useSubjectOptions`, and the
 * backfill in `supabase/migrations/20260916120000_assignment_class_link.sql`. If
 * they disagree, an assignment saved from the form is linked while the identical
 * row that came in from a file is not — and the only visible symptom is a class
 * rename that reaches some of somebody's coursework and not the rest.
 */

const classes: MatchableClass[] = [
  { id: "chem", name: "Chemistry" },
  { id: "bio", name: "Biology" },
  { id: "hist", name: " History " },
];

describe("resolving a subject to a class", () => {
  test("matches the obvious case", () => {
    expect(resolveClassId("Chemistry", classes)).toBe("chem");
  });

  test("ignores case, the way the picker does", () => {
    expect(resolveClassId("chemistry", classes)).toBe("chem");
    expect(resolveClassId("CHEMISTRY", classes)).toBe("chem");
  });

  test("ignores surrounding whitespace on either side", () => {
    expect(resolveClassId("  Chemistry  ", classes)).toBe("chem");
    // And on the stored name, which `ClassesManager` trims but older rows may not.
    expect(resolveClassId("History", classes)).toBe("hist");
  });

  test("returns null for a subject with no saved class", () => {
    // The ordinary case, and it has to stay cheap: most subjects are typed
    // freehand long before anybody saves them as a class.
    expect(resolveClassId("Woodwork", classes)).toBeNull();
  });

  test("returns null for an empty or whitespace subject", () => {
    // Guards a real bug: `find` on "" would match a class whose name is only
    // whitespace, linking an assignment to something nobody named.
    expect(resolveClassId("", classes)).toBeNull();
    expect(resolveClassId("   ", classes)).toBeNull();
  });

  test("returns null when there are no classes at all", () => {
    expect(resolveClassId("Chemistry", [])).toBeNull();
    expect(resolveClassId("Chemistry", undefined)).toBeNull();
  });

  test("picks the first of two classes that differ only by case", () => {
    // `ClassesManager` refuses to save the second of these, so it should not
    // occur — but rows predating that check exist, and returning *a* link is
    // better than returning none.
    const duplicated: MatchableClass[] = [
      { id: "first", name: "Chemistry" },
      { id: "second", name: "chemistry" },
    ];

    expect(resolveClassId("CHEMISTRY", duplicated)).toBe("first");
  });

  test("does not match a subject that merely contains a class name", () => {
    // The rule is equality, not inclusion. "Organic Chemistry" is its own
    // subject, and filing it under "Chemistry" would make a rename rewrite it.
    expect(resolveClassId("Organic Chemistry", classes)).toBeNull();
  });
});
