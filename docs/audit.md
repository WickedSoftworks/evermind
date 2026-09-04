# Evermind — Code Audit

**Version audited:** 2.9.0 (`v2` branch, commit `08ea054`)
**Date:** 2026-09-01
**Last reviewed:** 2026-09-04, against 2.14.5 (`d20d4d4`)
**Scope:** the whole repository — `app/`, `components/`, `lib/`, `hooks/`, `scripts/`, and build configuration.

**Method:** static review of every source file in the repository. Dependencies were not installed for the
original audit, so the project was **not** built, type-checked, or run as part of it; findings marked
*(unverified at runtime)* were read off the source.

Resolved findings are deleted rather than annotated — §6 keeps the list of what went and what replaced it.
Everything still present in §2 and §3 was re-checked against the working tree on the review date above, so a
finding here is open, not merely unreviewed.

---

## 1. Summary

Evermind is a single-purpose Next.js 16 App Router application: a student assignment tracker backed by
Supabase (Postgres + Auth + Row Level Security). The architecture is sound and deliberately thin — there is
no custom backend, the browser talks to Postgres directly through the Supabase client, and RLS is the
authorisation boundary. For an app of this size that is the right call.

The code is readable and the recent commits show real care about hydration correctness (`useMounted`, the
UTC-pinned date formatter). The original audit found the design sound and the finish lacking; most of the
finish has since been done. Where it stands at 2.14.5:

| Area | State |
|---|---|
| Architecture | Appropriate and simple. Unchanged, and still the right call. |
| Security | The RLS gap, the open redirect, the missing headers and the missing rate limiting are all closed. |
| Self-hostability | Works out of the box. Callback URL derived from the origin; `Dockerfile` and `compose.yaml` ship. |
| Error handling | Writes go through `lib/data/assignments.ts`, which throws, and `useAssignmentMutation`, which reports. |
| Data model | `overdue` gone from the union and the constraint; `updated_at` now maintained by a trigger. **No length constraints.** |
| Canvas import | CSV and `.imscc` dropped; JS, JSON and XML remain. **The parser has no test coverage, and the UI still advertises the two dropped formats.** |
| Theming | Every colour in a theme is now mapped onto a CSS variable. |
| Testing / CI | 110 tests over dates, the data layer, the mutation hook and the security helpers; biome and build in CI. **Nothing covers the Canvas parser.** |
| Dead weight | Still roughly 40 of 57 `components/ui` modules unused, along with their dependencies. |

The three things the original audit called out first — the hardcoded callback URL, the missing `WITH CHECK`,
and unchecked write errors — are all done, as is the last correctness item in the schema. What is worth doing
next, in order: **(1)** extracting the Canvas parser out of `settings-content.tsx` so it can be tested, since
it is the one substantial piece of logic with no coverage and the original reading was that it is where the
worst bugs are; **(2)** reminders, because the tagline still claims a feature that does not exist; **(3)** the
small correctness debts below — M4, M13, L16 — none of which take more than a few minutes.

---

## 2. Flaws

Severity is judged by impact on a self-hosted deployment with real users.

### 2.3 Medium

#### M4 — Referenced favicons do not exist

*(reopened at this review — it had been removed from this document, but nothing was changed)*

`app/layout.tsx:19-34` declares `/icon-light-32x32.png`, `/icon-dark-32x32.png`, `/icon.svg` and
`/apple-icon.png`. `public/` still contains only `placeholder-user.jpg`, `placeholder.jpg` and
`placeholder.svg`, and `app/` has no `icon.*` route either. Every page load fetches four 404s.

**Fix:** add the files, or drop the `icons` block until they exist.

#### M13 — An unpinned dependency

*(reopened at this review — it had been removed from this document, but nothing was changed)*

`"@supabase/supabase-js": "latest"` in `package.json:46`. Every other dependency is pinned or caret-ranged. A
committed `bun.lock` makes this reproducible *today* — it currently resolves 2.98.0 — but any refresh of the
lockfile silently pulls whatever the newest release is, including a major version. Pin it.

### 2.4 Low

#### L16 — The Canvas upload label offers two formats the picker rejects

*(new at this review)*

`components/settings-content.tsx:807,816`

```tsx
accept=".json,.xml,.js"
...
JS (course-data.js), CSV, JSON, XML, or IMSCC files
```

Removing the broken CSV parser and the `.imscc` path (H3, H4) left the prose underneath the upload box
untouched. A student who exported a CSV — the most likely thing to have to hand — picks the file, finds the
dialog will not accept it, and has no way to tell whether that is the app or their file.

**Fix:** `JS (course-data.js), JSON, or XML files`.

---

## 3. Missing features

Things a user would reasonably expect a deadline tracker to have, which it does not.

### 3.1 The gap between what is promised and what exists

- **Notifications and reminders.** The tagline is "Never miss a deadline again", and the app can only tell
  you about a deadline while you are looking at it. There is no email, no push, no browser notification, no
  digest. This is the single largest hole in the product.
- **Google Classroom import.** Presented in Settings as a first-class integration with a Connect button and a
  connection status; `handleGoogleClassroomConnect` (`settings-content.tsx:522-530`) waits a second and pops
  an `alert()` saying it is a placeholder.
- **Search and filtering.** Beyond the four status tabs there is nothing: no text search, no filter by
  subject or priority, no sort control. The list is fixed at due-date ascending.
- **Recurring assignments.** Weekly problem sets and readings are the most common thing a student tracks, and
  every occurrence must be entered by hand.
- **Subtasks or checklists** on an assignment, and any notion of partial progress.
- **Undo.** No action anywhere is reversible, including delete.

### 3.2 Infrastructure the project has grown into needing

- **Generated database types.** `lib/types.ts` is hand-written and can drift from the schema silently.
  `supabase gen types typescript` removes that class of error and makes the untyped `.from("assignments")`
  calls type-safe.
- **Structured error reporting.** `console.error` into a platform log is the whole strategy.
- **Accessibility review.** Priority in the weekly grid is conveyed by a coloured dot alone
  (`weekly-view.tsx:94`) with no text alternative — there is not one `aria-label`, `title` or `sr-only` in
  that file; there is no skip link anywhere in the app; keyboard traversal of the dropdown-per-card pattern
  has not been checked.
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
duplicating, and never overwrite a field the user has edited locally. It also retires the file parser, which
is the last untested logic in the app.

**4. Re-import and undo.** Export is done — `/api/account/export` pages through every row and returns an
`evermind.export` document, which satisfies the privacy policy. The other two halves are not: reading that
file back in, and a soft-delete column so "Delete" becomes recoverable for 30 days. Undo is a small change
with a large effect on how safe the app feels.

### 4.2 Medium value

**5. Courses as first-class rows.** Half done. A `classes` table now exists and Settings can save a list of
them, but it is only a picker: `assignments.subject` is still free text with no reference to it, so "Math",
"Maths" and "MATH 101" remain three different subjects to every query in the app. Making it a real foreign
key — plus a colour, an optional term and an instructor — gives colour-coding in the weekly view, per-course
filtering, and reliable grouping, and makes the Canvas mapping natural. The migration is the work: existing
rows have to be matched to classes by name, and the ones that match nothing need somewhere to go.

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

The Immediate, Foundations and Hardening phases of the original plan are done; what is left of it is below.

| Phase | Items |
|---|---|
| **Correctness** | Extract the Canvas parser out of `settings-content.tsx` and cover it — it is the last substantial piece of logic with no tests. |
| **Polish** | M4 (favicons), M13 (pin `supabase-js`), L16 (upload label), column length constraints, generated DB types. |
| **Product** | Reminders → ICS feed → live Canvas sync → re-import and undo → courses as real rows. |
| **Cleanup** | Prune the unused UI modules and their dependencies; the accessibility pass; `CONTRIBUTING.md`. |

---

## 6. Resolved since 2.9.0

Verified against the working tree on the review date, not taken from commit messages. Each line names what
now exists, so a claim here can be checked in one look.

| Finding | What closed it |
|---|---|
| C1 — hardcoded OAuth callback URL | `app/auth/login/page.tsx:21` derives it from `window.location.origin`. |
| C2 — UPDATE policy without `WITH CHECK` | `scripts/001` carries the clause; `scripts/003` repairs deployments already created. |
| H1 — open redirect in the auth callback | `app/auth/callback/route.ts` redirects to `origin` and validates `next` against `/^\/(?!\/)/`. |
| H2 — writes discarding their error | `lib/data/assignments.ts` throws `AssignmentWriteError`; `hooks/use-assignment-mutation.ts` turns it into a toast and revalidates only on success. |
| H3, H4 — the CSV parser and `.imscc` | Both formats dropped; the picker accepts `.json`, `.xml`, `.js`. See L16 for what was left behind. |
| M1 — due dates one day off | `lib/dates.ts`, with 34 timezone-independent tests over it. |
| M2 — the dead `overdue` status | Gone from the `Status` union; `scripts/003` narrows the CHECK constraint to match. |
| M3 — client-maintained `updated_at` | The `handle_updated_at` trigger (`scripts/004`); no client sends the column any more. |
| M5 — theme colours 80 % decorative | `components/color-theme-provider.tsx` maps every palette field onto a CSS variable. |
| M6 — the FOUC script's stale theme list | The inline script is generated from `DEFAULT_CUSTOM_THEMES` (`color-theme-provider.tsx:516`). |
| M7 — unguarded `JSON.parse` | Guarded at each call site. |
| M8 — providers swallowing their own absence | `useColorTheme` and `useCompactMode` both throw when the context is missing. |
| M9 — no security headers | Static headers in `next.config.mjs`; the nonce-carrying CSP in `lib/security-headers.ts`, set by the proxy. |
| M10 — no rate limiting or origin check | `lib/security/rate-limit.ts` and `lib/security/origin.ts`, applied in both account routes. |
| M11, M12 — ignored type errors, unrunnable lint | `ignoreBuildErrors: false`; biome replaced ESLint; both run in CI alongside the build. |
| L1 — `removeConsole` stripping diagnostics | Commented out in `next.config.mjs`. |
| Infrastructure | `Dockerfile` + `compose.yaml`; `scripts/003` and the migration convention; `/api/account/export`; 110 tests in `tests/`. |

Three findings had been removed from this document without the code changing: **C2**, fixed while writing
`scripts/003`, and **M4** and **M13**, reopened above. Worth knowing when reading the rest of this list.

---

## Related documents

- [`docs/architecture.md`](architecture.md) — how the application is put together.
- [`docs/self-hosting.md`](self-hosting.md) — running your own instance, and using the app.
