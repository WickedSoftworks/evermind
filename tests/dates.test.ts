import { describe, expect, test } from "bun:test";
import {
  addCalendarDays,
  DEFAULT_TIME_ZONE,
  dayKeyToUtcDate,
  dueDateLabel,
  formatDayKey,
  formatDueDate,
  isAssignmentOverdue,
  isAssignmentPending,
  isValidDate,
  normalizeTimeZone,
  parseDueDate,
  startOfWeekKey,
  zonedDayKey,
} from "@/lib/dates";
import type { Assignment } from "@/lib/types";

/**
 * `lib/dates.ts` is where the app's two subtlest bugs lived: a bare date read as
 * UTC midnight showing a day early, and "today"/"tomorrow" computed by adding
 * 24 hours to a timestamp. Both are calendar problems, so the assertions below
 * pin calendar behaviour rather than instants wherever they can.
 *
 * Nothing here may depend on the machine's own timezone. Where a local-time
 * result is unavoidable (`parseDueDate` of a date-only string, by design), the
 * assertion reads the local calendar fields back rather than an ISO string.
 */

function assignment(overrides: Partial<Assignment>): Pick<Assignment, "status" | "due_date"> {
  return { status: "pending", due_date: "2026-09-04T23:59:00.000Z", ...overrides };
}

describe("normalizeTimeZone", () => {
  test("keeps a valid IANA zone", () => {
    expect(normalizeTimeZone("Europe/London")).toBe("Europe/London");
    expect(normalizeTimeZone("America/New_York")).toBe("America/New_York");
  });

  test("falls back to the default when there is nothing to normalise", () => {
    expect(normalizeTimeZone(null)).toBe(DEFAULT_TIME_ZONE);
    expect(normalizeTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE);
    expect(normalizeTimeZone("")).toBe(DEFAULT_TIME_ZONE);
  });

  // The value arrives from a cookie, so it is attacker-controlled, and an
  // unknown zone makes Intl throw a RangeError that would take down SSR.
  test("rejects a zone Intl cannot use instead of throwing", () => {
    expect(normalizeTimeZone("Not/AZone")).toBe(DEFAULT_TIME_ZONE);
    expect(normalizeTimeZone("../../etc/passwd")).toBe(DEFAULT_TIME_ZONE);
    expect(normalizeTimeZone("'); DROP TABLE assignments; --")).toBe(DEFAULT_TIME_ZONE);
  });
});

describe("parseDueDate", () => {
  test("reads a date-only value as local end of day, not UTC midnight", () => {
    const parsed = parseDueDate("2026-03-15");

    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(2);
    expect(parsed.getDate()).toBe(15);
    expect(parsed.getHours()).toBe(23);
    expect(parsed.getMinutes()).toBe(59);
  });

  test("trims before deciding the value is date-only", () => {
    expect(parseDueDate("  2026-03-15  ").getHours()).toBe(23);
  });

  test("passes a full timestamp through untouched", () => {
    expect(parseDueDate("2026-03-15T08:30:00.000Z").toISOString()).toBe("2026-03-15T08:30:00.000Z");
  });

  test("returns an Invalid Date rather than throwing", () => {
    for (const input of [null, undefined, "", "not a date", "2026-13-45T99:99:99Z"]) {
      expect(isValidDate(parseDueDate(input))).toBe(false);
    }
  });
});

describe("zonedDayKey", () => {
  test("reports the calendar day in the given zone, not in UTC", () => {
    const instant = new Date("2026-03-15T02:30:00.000Z");

    expect(zonedDayKey(instant, "UTC")).toBe("2026-03-15");
    expect(zonedDayKey(instant, "America/New_York")).toBe("2026-03-14");
    expect(zonedDayKey(instant, "Asia/Tokyo")).toBe("2026-03-15");
  });

  test("pads to a sortable YYYY-MM-DD", () => {
    expect(zonedDayKey(new Date("2026-01-05T12:00:00.000Z"), "UTC")).toBe("2026-01-05");
  });

  test("is empty for an invalid date", () => {
    expect(zonedDayKey(new Date(Number.NaN), "UTC")).toBe("");
  });
});

describe("addCalendarDays", () => {
  test("crosses month, year and leap-day boundaries", () => {
    expect(addCalendarDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  // The arithmetic is done in UTC precisely so a DST transition cannot swallow
  // or duplicate a day the way local-time date maths does.
  test("is unaffected by a DST transition", () => {
    expect(addCalendarDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addCalendarDays("2026-10-31", 1)).toBe("2026-11-01");
  });

  test("moves by whole weeks", () => {
    expect(addCalendarDays("2026-09-04", 7)).toBe("2026-09-11");
    expect(addCalendarDays("2026-09-04", -7)).toBe("2026-08-28");
  });
});

describe("startOfWeekKey", () => {
  test("weeks start on Monday", () => {
    // 2026-09-04 is a Friday, 09-06 the Sunday that ends the same week.
    expect(startOfWeekKey("2026-09-04")).toBe("2026-08-31");
    expect(startOfWeekKey("2026-09-06")).toBe("2026-08-31");
  });

  test("a Monday is its own week start", () => {
    expect(startOfWeekKey("2026-09-07")).toBe("2026-09-07");
  });
});

describe("dayKeyToUtcDate", () => {
  test("anchors the key at UTC midnight", () => {
    expect(dayKeyToUtcDate("2026-09-04").toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });
});

describe("formatDayKey", () => {
  // Pinned to UTC on purpose: the key is already a plain calendar date, so
  // shifting it into the viewer's zone would move it.
  test("formats the key itself, whatever the machine's zone", () => {
    expect(formatDayKey("2026-09-04", { weekday: "short" })).toBe("Fri");
    expect(formatDayKey("2026-09-04", { month: "short", day: "numeric" })).toBe("Sep 4");
  });
});

describe("formatDueDate", () => {
  test("renders in the requested zone", () => {
    expect(formatDueDate(new Date("2026-09-04T12:00:00.000Z"), "UTC")).toBe("Sep 4, 2026");
  });

  test("an instant just past midnight UTC is still the previous day out west", () => {
    const instant = new Date("2026-09-05T02:00:00.000Z");

    expect(formatDueDate(instant, "UTC")).toBe("Sep 5, 2026");
    expect(formatDueDate(instant, "America/New_York")).toBe("Sep 4, 2026");
  });

  test("says so when there is no usable date", () => {
    expect(formatDueDate(new Date(Number.NaN), "UTC")).toBe("No due date");
  });
});

describe("dueDateLabel", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");

  test("names today and tomorrow", () => {
    expect(dueDateLabel(new Date("2026-09-04T23:59:00.000Z"), "UTC", now)).toBe("Due today");
    expect(dueDateLabel(new Date("2026-09-05T09:00:00.000Z"), "UTC", now)).toBe("Due tomorrow");
  });

  test("falls back to a formatted date beyond tomorrow", () => {
    expect(dueDateLabel(new Date("2026-09-06T09:00:00.000Z"), "UTC", now)).toBe("Sep 6, 2026");
  });

  // These two are the reason the comparison is on calendar keys rather than on
  // elapsed milliseconds: the gap in hours says nothing about the day.
  test("two hours away can be tomorrow", () => {
    const late = new Date("2026-09-04T23:00:00.000Z");

    expect(dueDateLabel(new Date("2026-09-05T01:00:00.000Z"), "UTC", late)).toBe("Due tomorrow");
  });

  test("twenty hours away can still be today", () => {
    const early = new Date("2026-09-04T04:00:00.000Z");

    expect(dueDateLabel(new Date("2026-09-04T23:59:00.000Z"), "UTC", early)).toBe("Due today");
  });

  test("the answer follows the viewer's zone", () => {
    const due = new Date("2026-09-05T02:00:00.000Z");

    expect(dueDateLabel(due, "UTC", now)).toBe("Due tomorrow");
    expect(dueDateLabel(due, "America/New_York", now)).toBe("Due today");
  });

  test("says so when there is no usable date", () => {
    expect(dueDateLabel(new Date(Number.NaN), "UTC", now)).toBe("No due date");
  });
});

describe("isAssignmentOverdue", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");

  test("a pending assignment past its due date is overdue", () => {
    expect(isAssignmentOverdue(assignment({ due_date: "2026-09-03T23:59:00.000Z" }), now)).toBe(true);
  });

  test("a pending assignment still to come is not", () => {
    expect(isAssignmentOverdue(assignment({ due_date: "2026-09-05T23:59:00.000Z" }), now)).toBe(false);
  });

  // Completing something late must not leave it flagged in red for ever.
  test("a completed assignment is never overdue", () => {
    expect(isAssignmentOverdue(assignment({ status: "completed", due_date: "2020-01-01T00:00:00.000Z" }), now)).toBe(
      false,
    );
  });

  test("an unparseable due date is not overdue", () => {
    expect(isAssignmentOverdue(assignment({ due_date: "not a date" }), now)).toBe(false);
  });

  test("the deadline instant itself has not passed yet", () => {
    expect(isAssignmentOverdue(assignment({ due_date: now.toISOString() }), now)).toBe(false);
  });
});

describe("isAssignmentPending", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");

  test("pending means pending and not yet overdue", () => {
    expect(isAssignmentPending(assignment({ due_date: "2026-09-05T23:59:00.000Z" }), now)).toBe(true);
  });

  // The dashboard tabs are exclusive: an overdue item belongs to Overdue only.
  test("an overdue assignment is not also pending", () => {
    expect(isAssignmentPending(assignment({ due_date: "2026-09-03T23:59:00.000Z" }), now)).toBe(false);
  });

  test("a completed assignment is not pending", () => {
    expect(isAssignmentPending(assignment({ status: "completed" }), now)).toBe(false);
  });
});
