import type { Assignment } from "@/lib/types";

/** Cookie the browser writes its IANA timezone into, so the server can format dates the same way. */
export const TIMEZONE_COOKIE = "tz";

/** Used until the browser has told us where it is — i.e. on the very first request from a device. */
export const DEFAULT_TIME_ZONE = "UTC";

/**
 * The cookie is user-controlled input, and `Intl.DateTimeFormat` throws a
 * RangeError on an unknown timezone, which during SSR would take down the page.
 */
export function normalizeTimeZone(value: string | null | undefined): string {
  if (!value) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** The visitor's timezone as the browser reports it, or the default if it cannot say. */
export function resolveBrowserTimeZone(): string {
  try {
    return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a due date without losing a day.
 *
 * A bare "YYYY-MM-DD" is read by `new Date()` as UTC midnight, which renders as
 * the *previous* day for anyone west of Greenwich. Treat date-only input as
 * local end-of-day instead, matching the 23:59 default of the add/edit dialogs.
 *
 * Returns an Invalid Date rather than throwing; check with `isValidDate`.
 */
export function parseDueDate(input: string | null | undefined): Date {
  if (!input) return new Date(Number.NaN);
  const trimmed = input.trim();
  if (DATE_ONLY.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return new Date(year, month - 1, day, 23, 59, 0, 0);
  }
  return new Date(trimmed);
}

export function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

const dayKeyFormatters = new Map<string, Intl.DateTimeFormat>();
const dueDateFormatters = new Map<string, Intl.DateTimeFormat>();

function cachedFormatter(
  cache: Map<string, Intl.DateTimeFormat>,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  let formatter = cache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, ...options });
    cache.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * The calendar day an instant falls on *in a given timezone*, as "YYYY-MM-DD".
 *
 * Comparing these keys is how "same day", "today" and "tomorrow" are decided:
 * it is calendar arithmetic, so it survives DST transitions that adding 24h to
 * a timestamp does not.
 */
export function zonedDayKey(date: Date, timeZone: string): string {
  if (!isValidDate(date)) return "";
  const parts = cachedFormatter(dayKeyFormatters, timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addCalendarDays(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** A day key as a UTC instant, for formatting the key itself (never for comparing against a due date). */
export function dayKeyToUtcDate(dayKey: string): Date {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** The Monday that starts the week a day key falls in. */
export function startOfWeekKey(dayKey: string): string {
  const weekday = dayKeyToUtcDate(dayKey).getUTCDay();
  return addCalendarDays(dayKey, -(weekday === 0 ? 6 : weekday - 1));
}

/**
 * Format a day key. Pinned to UTC on purpose: the key is already a plain
 * calendar date, so shifting it into a zone again would move it.
 */
export function formatDayKey(dayKey: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(dayKeyToUtcDate(dayKey));
}

/** "Sep 3, 2026", rendered in the given timezone so the server and the browser agree. */
export function formatDueDate(date: Date, timeZone: string): string {
  if (!isValidDate(date)) return "No due date";
  return cachedFormatter(dueDateFormatters, timeZone, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function dueDateLabel(date: Date, timeZone: string, now: Date = new Date()): string {
  if (!isValidDate(date)) return "No due date";
  const dueKey = zonedDayKey(date, timeZone);
  const todayKey = zonedDayKey(now, timeZone);
  if (dueKey === todayKey) return "Due today";
  if (dueKey === addCalendarDays(todayKey, 1)) return "Due tomorrow";
  return formatDueDate(date, timeZone);
}

type AssignmentTiming = Pick<Assignment, "status" | "due_date">;

/**
 * The single definition of "overdue". The status column never holds it — it is
 * derived, and it used to be derived separately in four places.
 */
export function isAssignmentOverdue(assignment: AssignmentTiming, now: Date = new Date()): boolean {
  if (assignment.status === "completed") return false;
  const dueDate = parseDueDate(assignment.due_date);
  return isValidDate(dueDate) && dueDate.getTime() < now.getTime();
}

export function isAssignmentPending(assignment: AssignmentTiming, now: Date = new Date()): boolean {
  return assignment.status === "pending" && !isAssignmentOverdue(assignment, now);
}
