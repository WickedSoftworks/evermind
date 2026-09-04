# Evermind — Code Audit

**Version audited:** 2.9.0 (`v2` branch, commit `08ea054`)
**Date:** 2026-09-01
**Scope:** the whole repository — `app/`, `components/`, `lib/`, `hooks/`, `scripts/`, and build configuration.

**Method:** static review of every source file in the repository. Dependencies were not installed, so the
project was **not** built, type-checked, or run as part of this audit. Findings marked *(unverified at runtime)*
are read off the source and would benefit from confirmation against a running instance.

---

## 1. Summary

Evermind is a single-purpose Next.js 16 App Router application: a student assignment tracker backed by
Supabase (Postgres + Auth + Row Level Security). The architecture is sound and deliberately thin — there is
no custom backend, the browser talks to Postgres directly through the Supabase client, and RLS is the
authorisation boundary. For an app of this size that is the right call.

The code is readable and the recent commits show real care about hydration correctness (`useMounted`, the
UTC-pinned date formatter). What holds it back is not the design but the finish:

| Area | State |
|---|---|
| Architecture | Appropriate and simple. |
| Security | One genuine RLS gap, one open-redirect vector, no security headers, no rate limiting. |
| Self-hostability | **Broken out of the box** — the OAuth callback URL is hardcoded to the author's domain. |
| Error handling | Effectively absent. Every database write ignores its error result. |
| Data model | An unused `overdue` status; no `updated_at` trigger; no length constraints. |
| Canvas import | The advertised headline feature has a broken CSV parser and an unimplementable `.imscc` path. |
| Theming | Four of the five colours in every theme are never applied. |
| Testing / CI | None. The `lint` script cannot run — there is no ESLint config or dependency. |
| Dead weight | 39 of 60 `components/ui` modules are unused, along with their dependencies. |

The three things worth fixing first, in order: **(1)** the hardcoded callback URL, because it makes the
project unusable by anyone else; **(2)** the missing `WITH CHECK` on the UPDATE policy, because it is the
only real hole in the authorisation model; **(3)** error handling on writes, because silent data loss is the
worst failure mode a deadline tracker can have.

---

## 2. Flaws

Severity is judged by impact on a self-hosted deployment with real users.

### 2.3 Medium

#### M3 — `updated_at` is maintained by the client, inconsistently

There is no trigger on the table. `updated_at` is set by hand in the edit dialog and in complete/reopen, but
not by the Canvas import, and never by anything that writes outside the UI. A client-supplied modification
timestamp is also trivially falsifiable.

**Fix:** the standard `moddatetime` trigger, and remove `updated_at` from every client payload.
---

## 3. Missing features

Things a user would reasonably expect a deadline tracker to have, which it does not.

### 3.1 The gap between what is promised and what exists

- **Notifications and reminders.** The tagline is "Never miss a deadline again", and the app can only tell
  you about a deadline while you are looking at it. There is no email, no push, no browser notification, no
  digest. This is the single largest hole in the product.
- **Google Classroom import.** Presented in Settings as a first-class integration with a Connect button and a
  connection status; `handleGoogleClassroomConnect` (`settings-content.tsx:486-495`) waits a second and pops
  an `alert()` saying it is not implemented.
- **Search and filtering.** Beyond the four status tabs there is nothing: no text search, no filter by
  subject or priority, no sort control. The list is fixed at due-date ascending.
- **Recurring assignments.** Weekly problem sets and readings are the most common thing a student tracks, and
  every occurrence must be entered by hand.
- **Subtasks or checklists** on an assignment, and any notion of partial progress.
- **Undo.** No action anywhere is reversible, including delete.

### 3.2 Infrastructure the project has grown into needing

- **A second migration file, and a migration convention.** `scripts/001_...sql` uses `IF NOT EXISTS` for the
  table and index but bare `CREATE POLICY` for the policies, so re-running it errors. There is no way to
  express a schema change today except editing file 001 in place, which existing deployments will never pick
  up.
- **Generated database types.** `lib/types.ts` is hand-written and can drift from the schema silently.
  `supabase gen types typescript` removes that class of error and makes the untyped `.from("assignments")`
  calls type-safe.
- **A `Dockerfile` and `compose.yaml`**, given the project invites self-hosting.
- **Structured error reporting.** `console.error` into a platform log is the whole strategy.
- **Accessibility review.** Priority in the weekly grid is conveyed by a coloured dot alone
  (`weekly-view.tsx:96-99`) with no text alternative; there is no skip link; keyboard traversal of the
  dropdown-per-card pattern has not been checked.
- **A contributor guide.** GPL-3.0 is chosen but there is no `CONTRIBUTING.md`, no issue templates, and no
  statement of what the project will and will not accept.

---

## 4. Features worth building

Ordered by value relative to effort. The first four are what turn this from a demo into something a student
would actually rely on.

### 4.1 High value

**1. Deadline reminders.** A scheduled job (Supabase `pg_cron`, or a Vercel cron route) that runs hourly,
finds assignments due inside a user-configured window, and sends email through a provider such as Resend. Add
a `notification_preferences` table (lead time, quiet hours, channel) and a `notified_at` column to make sends
idempotent. This is the feature the tagline already claims.

**2. Calendar feed (ICS).** A read-only, token-authenticated `/api/calendar/[token].ics` endpoint publishing
the user's assignments as `VEVENT`s with alarms. Cheap to build, and it puts Evermind into Google Calendar,
Apple Calendar and Outlook without an integration for each. Pair with a "Copy calendar URL" button in
Settings and a rotate-token action.

**3. Live Canvas sync via an access token.** The file-import flow exists because there is no API integration.
Canvas lets a user generate a personal access token; with it, a server route can pull
`/api/v1/users/self/upcoming_events` and `/api/v1/courses/:id/assignments` directly. Store the token
encrypted, sync on a schedule, key rows by a `source` + `external_id` pair so re-syncs update instead of
duplicating, and never overwrite a field the user has edited locally. This subsumes most of §2.2's parser
problems.

**4. Import/export and undo.** JSON export of everything (satisfying the privacy policy), JSON re-import, and
a soft-delete column so "Delete" becomes recoverable for 30 days. Undo is a small change with a large effect
on how safe the app feels.

### 4.2 Medium value

**5. Courses as first-class rows.** `subject` is free text today, so "Math", "Maths" and "MATH 101" are three
different subjects. A `courses` table with a name, colour, optional term and instructor gives colour-coding
in the weekly view, per-course filtering, and reliable grouping — and makes the Canvas mapping natural.

**6. A real calendar view.** Month and agenda views alongside the existing week strip, drag-to-reschedule,
and a day detail panel. The weekly view currently truncates to two items per day with a `+n` badge and no way
to see the rest.

**7. Workload forecasting.** With priority, due date and (from Canvas) points available, the app can show a
"heaviest week ahead" signal and warn when several high-priority items land on one day. This is the analysis
a planner is uniquely placed to do and a calendar is not.

**8. Grade and points tracking.** Record points earned against points possible, roll up per course, and
project a current grade. Students already keep this in a spreadsheet.

**9. Full-text search and saved filters.** A Postgres `tsvector` column over title, subject and description,
with a `⌘K` command palette — `cmdk` is already a transitive dependency via the unused `command.tsx`.

**10. Offline support / PWA.** A manifest, an install prompt, a service worker caching the shell, and a
mutation queue that drains on reconnect. Students check deadlines on phones with bad campus wifi.

### 4.3 Lower priority, still worth listing

**11. Attachments.** Supabase Storage buckets, scoped by RLS to the owner, for rubrics and briefs.

**12. Study sessions.** Time blocks scheduled against an assignment, with a Pomodoro timer and time-spent
totals feeding the workload forecast.

**13. Shared course boards.** Read-only lists a class can subscribe to, so one person entering the syllabus
serves everyone. Needs a real sharing model and a careful RLS design — treat as a major version.

**14. Theme import/export.** Themes are already JSON in localStorage; a share string is a few lines, and it
gives the theming system a reason to exist beyond one accent colour. Fix M5 first.

**15. Keyboard-first operation.** `n` for new, `/` for search, `j`/`k` to move, `x` to complete. The
underlying primitives are all present.

---

## 5. Suggested order of work

| Phase | Items |
|---|---|
| **Immediate** | C1 (callback URL), C2 (`WITH CHECK`), H1 (open redirect), H2 (write errors). |
| **Foundations** | M12 + ESLint config, M11 (stop ignoring type errors), CI, tests for the import parser, a migration convention, generated DB types. |
| **Correctness** | H3, H4 (import), M1 (timezones), M2 (`overdue`), M3 (`updated_at`), M5–M8 (theming and providers). |
| **Hardening** | M9 (headers), M10 (rate limiting, origin check), L11/L12 (limits), L15 (env docs). |
| **Product** | Reminders → ICS feed → live Canvas sync → export/undo → courses. |
| **Cleanup** | L1–L10, L13, L14; prune the 39 unused UI modules and their dependencies. |

---

## Related documents

- [`docs/architecture.md`](architecture.md) — how the application is put together.
- [`docs/self-hosting.md`](self-hosting.md) — running your own instance, and using the app.
