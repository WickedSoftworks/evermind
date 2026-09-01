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

### 2.1 Critical

#### C1 — The OAuth callback URL is hardcoded to the author's production domain

`app/auth/login/page.tsx:17-22`

```ts
const getRedirectUrl = () => {
  const currentUrl = typeof window !== 'undefined' ? window.location.origin : ''
  return currentUrl.includes('localhost')
    ? 'http://localhost:3000/auth/callback'
    : 'https://evermind.shxrk.dev/auth/callback'
}
```

Any deployment that is not on `localhost` sends its users to `evermind.shxrk.dev` to complete sign-in. A
self-hoster following the README to the letter gets an app where sign-in silently hands off to somebody
else's site — and it fails there too, since that origin's Supabase project will reject the code. It also
breaks `localhost` on any port other than 3000, and breaks preview deployments.

**Fix:** use `` `${window.location.origin}/auth/callback` ``, and let the Supabase project's redirect
allow-list be the thing that constrains it. If a fixed public URL is genuinely wanted for the hosted
instance, read it from `NEXT_PUBLIC_SITE_URL` with the origin as the fallback.

#### C2 — The UPDATE row-level security policy has no `WITH CHECK`

`scripts/001_create_assignments_table.sql:27-29`

```sql
CREATE POLICY "Users can update their own assignments"
  ON assignments FOR UPDATE
  USING (auth.uid() = user_id);
```

`USING` decides which rows a user may *target*. `WITH CHECK` decides what the row may look like *after* the
write, and Postgres does not infer one from the other. Without it, an authenticated user can issue

```js
supabase.from("assignments").update({ user_id: "<someone-else's-uuid>" }).eq("id", myRowId)
```

and push a row into another account, where the owner cannot delete it and did not create it. It is a
write-into-another-tenant primitive — limited in blast radius here, but it is a genuine break of the
isolation the schema claims to provide.

**Fix:**

```sql
CREATE POLICY "Users can update their own assignments"
  ON assignments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Consider also revoking UPDATE on the `user_id` column outright — nothing in the app ever changes it.

### 2.2 High

#### H1 — Open redirect in the auth callback via `x-forwarded-host` and `next`

`app/auth/callback/route.ts:9,15-21`

```ts
const next = searchParams.get("next") ?? "/dashboard"
// ...
const forwardedHost = request.headers.get("x-forwarded-host")
if (forwardedHost) return NextResponse.redirect(`https://${forwardedHost}${next}`)
```

`x-forwarded-host` is a request header. On a platform that overwrites it (Vercel) this is safe; on a
self-hosted deployment behind a reverse proxy that merely appends to it, or none at all, a caller controls
where a *freshly authenticated* session lands. `next` is likewise taken from the query string and
concatenated with no validation.

**Fix:** drop the `forwardedHost` branch and redirect to `` `${origin}${next}` `` — `origin` already comes
from the request URL that Next resolved. Validate `next` as a same-site path: reject anything that does not
match `/^\/(?!\/)/`, which blocks both absolute URLs and protocol-relative `//evil.example` values.

#### H2 — Every database write discards its error

`components/assignment-card.tsx:76-104`, `components/add-assignment-dialog.tsx:73-82`,
`components/edit-assignment-dialog.tsx:71-83`

```ts
await supabase.from("assignments").delete().eq("id", assignment.id)
mutate("assignments")
```

Supabase's client does not throw on failure; it returns `{ error }`. Nothing here reads it. If a write is
rejected — offline, expired session, RLS denial, a constraint violation — the dialog closes, the toast never
fires, and the revalidation quietly restores the old row. The user believes their assignment was saved,
edited, or deleted when it was not. For an app whose entire promise is "never miss a deadline", this is the
most damaging class of bug present.

The one place that *does* check (`settings-content.tsx:463`, the Canvas import) proves the pattern is known;
it just was not applied to the other five call sites. A `Toaster` is already mounted in the root layout and
goes essentially unused.

**Fix:** destructure `{ error }` at every call site, surface it with `toast({ variant: "destructive" })`, and
keep the dialog open on failure. Better still, lift the six inline mutations into a small
`lib/data/assignments.ts` that throws, and let one `useAssignmentMutation` hook own the error and revalidation
handling.

#### H3 — The Canvas CSV parser mangles most real CSV files

`components/settings-content.tsx:181`

```ts
const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)?.map(/* ... */) || []
```

Two independent defects:

- `[^",\s]+` excludes whitespace, and the lookahead requires the token to sit immediately before a comma or
  end of line. An unquoted multi-word cell — `Math Homework Chapter 5`, which is exactly what a Canvas
  export contains — matches only its **last word**.
- Empty cells produce no match at all, so they are dropped from the array rather than preserved as `""`.
  Every column after the first blank cell is then read from the wrong index: descriptions land in the title
  field, course names in the due date.

The column-detection heuristics above it (`settings-content.tsx:174-178`) compound this: `h.includes("date")`
matches `created date` before it reaches `due date`, and `h.includes("name")` matches `course name` before
`assignment name`, because `findIndex` returns the first hit in file order.

**Fix:** replace the regex with a real CSV reader — a small state machine handling quoted fields, escaped
quotes and embedded newlines, or a dependency such as `papaparse`. Score header candidates rather than taking
the first substring hit, and let the user remap columns in the preview dialog when detection is wrong.

#### H4 — `.imscc` import cannot work as written

`components/settings-content.tsx:376-401`, and advertised in `README.md`

`.imscc` is an IMS Common Cartridge: a **ZIP archive**. The handler calls `file.text()` and feeds the result
to `DOMParser`, which will parse binary ZIP bytes as XML, produce a parser-error document, match nothing, and
report "No assignments found in file." The README lists Common Cartridge as a supported import format.

**Fix:** either unzip in the browser (`fflate`, ~10 KB) and parse `imsmanifest.xml` plus the per-resource
XML inside, or remove `.imscc` from the accept list and the README until it is implemented.

### 2.3 Medium

#### M1 — Due dates can display one day off

`components/add-assignment-dialog.tsx:69-78` builds the timestamp with `setHours` in **local** time and
serialises with `toISOString`, which is correct. But `assignment-card.tsx:14-19` formats the first render
with a UTC-pinned formatter to avoid a hydration mismatch, so a user at UTC−5 with an assignment due at
00:30 local sees the *next* day until hydration completes and the label swaps. The import path is worse:
`due_date` is truncated to `toISOString().split("T")[0]` and later re-parsed by `new Date("2026-03-04")`,
which JavaScript reads as UTC midnight — so every imported assignment renders a day early for anyone west of
Greenwich, and the original time of day is discarded entirely.

**Fix:** store the user's IANA timezone (once, in a `profiles` row or `user_metadata`) and format server-side
against it, which removes both the mismatch and the flash. At minimum, stop truncating imported timestamps.

#### M2 — The `overdue` status is dead, and the derivation is duplicated four times

The schema (`scripts/001_create_assignments_table.sql:9`) and `lib/types.ts:2` both admit `'overdue'`, but
nothing ever writes it — overdue is computed on the fly as `status !== "completed" && isPast(due_date)` in
`assignments-list.tsx:76-78`, `preview-assignments-list.tsx:28-30`, `stats-cards.tsx:12-14` and
`assignment-card.tsx:63`. Four copies of one rule, plus a database column whose declared domain does not
match its actual contents.

**Fix:** drop `'overdue'` from the type and the CHECK constraint (`status` becomes `pending | completed`),
and put the derivation in one exported helper — `isOverdue(a)` and a single `partitionAssignments(list)` used
by both the real and preview lists.

#### M3 — `updated_at` is maintained by the client, inconsistently

There is no trigger on the table. `updated_at` is set by hand in the edit dialog and in complete/reopen, but
not by the Canvas import, and never by anything that writes outside the UI. A client-supplied modification
timestamp is also trivially falsifiable.

**Fix:** the standard `moddatetime` trigger, and remove `updated_at` from every client payload.

#### M4 — Referenced favicons do not exist

`app/layout.tsx:20-32` declares `/icon-light-32x32.png`, `/icon-dark-32x32.png`, `/icon.svg` and
`/apple-icon.png`. `public/` contains only `placeholder-user.jpg`, `placeholder.jpg` and `placeholder.svg`.
Every page load fetches four 404s. *(unverified at runtime — but the files are plainly absent.)*

#### M5 — Theme colours are 80 % decorative

`components/color-theme-provider.tsx:120-130` applies only `--primary` and `--ring`. Every theme also
declares `background`, `foreground`, `card` and `accent`, and none of them are ever set on the document. The
consequence is visible: "Plasma" and "Night Swim" describe dark palettes (`background: "#1a1a1a"`) but
selecting them changes nothing except the accent colour. The custom-theme editor
(`settings-content.tsx:919`) exposes only a primary-colour input, so the other four fields of `CustomTheme`
can never be edited either — they are state that exists solely to be ignored.

**Fix:** apply the full set of variables, and derive the dark-mode variants (or store a light and dark pair
per theme). If the intent really is accent-only theming, reduce `CustomTheme` to `{ id, name, primary }` and
delete the rest.

#### M6 — The FOUC script knows about only five of the eight built-in themes

`components/color-theme-provider.tsx:210-216` inlines a hardcoded copy of the theme list into the `<head>`
script, and it lists `ocean`, `forest`, `sunset`, `lavender` and `plasma` — but not `nightswim`, `mint` or
`candy`, which were added later. Users on those three get exactly the flash of unthemed colour the script
exists to prevent.

**Fix:** generate the inline script from `DEFAULT_CUSTOM_THEMES` (`JSON.stringify` the ids and primaries into
the template literal) so the two can never drift again.

#### M7 — Unguarded `JSON.parse` of localStorage

`components/color-theme-provider.tsx:143`, and the same pattern in the inline script (which *is* guarded).
A malformed `evermind-custom-themes` value throws inside the mount effect, so `setMounted(true)` never runs
and the provider permanently renders its children with no context — silently, because `useColorTheme`
(`:184-192`) returns defaults instead of throwing when the context is missing.

**Fix:** wrap the parse in `try/catch` and fall back to the defaults; validate the parsed shape before use.

#### M8 — Providers that swallow their own absence

`compact-mode-provider.tsx:38-40` and `color-theme-provider.tsx:172-174` both render `<>{children}</>` before
mount, and both hooks return silent defaults when the context is missing. Together this means a real
mis-wiring — a consumer rendered outside its provider — is indistinguishable from normal operation. It also
guarantees that the first client render of every consumer sees `isCompact: false` regardless of the stored
preference; the inline head script papers over this for CSS, but any component that branches on `isCompact`
in JS will be wrong on the first pass.

**Fix:** initialise state from `localStorage` in a lazy `useState` initialiser, always render the provider,
and let the hooks throw when the context is genuinely absent.

#### M9 — No security headers

There is no `headers()` block in `next.config.mjs`. Missing: `Content-Security-Policy`,
`Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`. The app is framable, which matters because it holds a live session.

#### M10 — No rate limiting, and no explicit origin check on account deletion

`app/api/account/delete/route.ts` is a `POST` with no body, guarded only by the session cookie. Supabase's
auth cookies default to `SameSite=Lax`, which does block a cross-site form POST, so this is not currently
exploitable — but the safety comes entirely from a default the app does not set or assert. An explicit
`Origin`/`Sec-Fetch-Site` check costs three lines and removes the dependency on that default. Separately,
nothing anywhere is rate limited: sign-in attempts, imports, and writes are all unthrottled.

#### M11 — TypeScript errors are ignored at build time

`next.config.mjs:3-5` sets `typescript.ignoreBuildErrors: true`. Combined with the absence of a working
`lint` script (see M12) and any tests, nothing at all gates a broken commit. This flag is a scaffolding
default from the generator; it should not survive into a real deployment.

#### M12 — The `lint` script cannot run

`package.json` declares `"lint": "eslint ."`, but there is no ESLint configuration file anywhere in the repo
and neither `eslint` nor `eslint-config-next` appears in `devDependencies`. The command fails immediately.

#### M13 — An unpinned dependency

`"@supabase/supabase-js": "latest"` in `package.json`. Every other dependency is pinned or caret-ranged. A
committed `bun.lock` makes this reproducible *today*, but any refresh of the lockfile silently pulls whatever
the newest release is, including a major version. Pin it.

### 2.4 Low

- **L1 — `removeConsole` strips server diagnostics.** `next.config.mjs:23-26` removes `console.*` in
  production, which also removes `console.error("Account deletion failed:", ...)` in the delete route — the
  only diagnostic that route has. Use `removeConsole: { exclude: ["error"] }`.
- **L2 — Dead code.** `fetchUserAndDashboardData` (`lib/data/dashboard.ts:36-56`) has no callers.
  `components/ui/use-mobile.tsx` and `components/ui/use-toast.ts` duplicate the `hooks/` versions and are
  unreferenced.
- **L3 — 39 unused UI modules.** Only 21 of the 60 files in `components/ui` are imported. The unused ones
  drag in `recharts`, `embla-carousel-react`, `react-resizable-panels`, `input-otp`, `cmdk` and
  `react-hook-form` as dependencies. Nothing in the app uses React Hook Form at all — every form is
  hand-rolled `useState` — yet the README lists it in the tech stack.
- **L4 — Cargo-culted `Promise.all`.** `lib/data/dashboard.ts:19-27` and `app/dashboard/page.tsx:24-27` wrap
  a *single* promise in `Promise.all` under comments describing parallel fetching. Harmless, but the comments
  claim a behaviour the code does not have.
- **L5 — Deleting an assignment has no confirmation.** `assignment-card.tsx:139-142` deletes on a single
  dropdown click, irreversibly, with no undo. Deleting an *account* is guarded by typing your email address;
  deleting a week's work is not guarded at all.
- **L6 — Preview mock data drifts for up to an hour.** `app/preview/page.tsx:6` sets `revalidate = 3600`, so
  "due in 2 days" is computed at cache-fill time. Crossing midnight inside that window makes the preview's
  own labels inconsistent. Rendering the preview data on the client would remove the problem.
- **L7 — The logo always links to `/dashboard`.** `header.tsx:39`, including in preview mode, so a
  signed-out visitor clicking the wordmark is bounced to the login page.
- **L8 — Stale metadata.** `app/layout.tsx:22` still declares `generator: "v0.app"`.
- **L9 — The privacy policy over-promises.** It offers data export ("request exportation of your data"),
  which the app cannot do, and gives a contact address at `evermind.today` while the deployment lives at
  `evermind.shxrk.dev`.
- **L10 — No error boundaries.** There is no `error.tsx`, `global-error.tsx` or `not-found.tsx` anywhere in
  `app/`. A thrown render error shows the default Next.js error screen.
- **L11 — Unbounded text fields.** No `CHECK (length(title) <= n)` on any column and no `maxLength` on any
  input. A single row can hold megabytes.
- **L12 — Unbounded fetch.** `select("*")` with no `limit` or pagination on either the server or client
  fetch. Fine at student scale; it has no ceiling.
- **L13 — No `router.refresh()` after mutation.** SWR updates the client cache, but the server-rendered
  `initialData` for `/dashboard` is not invalidated, so a back-navigation into the App Router cache can show
  a stale list.
- **L14 — No tests and no CI.** No test runner, no test files, no `.github/workflows`.
- **L15 — Service-role key documented without warning.** `.example.env` lists `SUPABASE_SERVICE_ROLE_KEY`
  beside two `NEXT_PUBLIC_` values with no comment that it bypasses RLS entirely and must never be exposed to
  the browser. `.example.env` also carries `GOOGLE_CALLBACK_URL` and `SESSION_SECRET`, which nothing in the
  codebase reads — leftovers that invite a self-hoster to configure the wrong thing.

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
- **Data export.** Promised in the privacy policy and by the "right to access" language on that page; not
  implemented. The account-deletion route shows the pattern to follow.
- **Search and filtering.** Beyond the four status tabs there is nothing: no text search, no filter by
  subject or priority, no sort control. The list is fixed at due-date ascending.
- **Recurring assignments.** Weekly problem sets and readings are the most common thing a student tracks, and
  every occurrence must be entered by hand.
- **Subtasks or checklists** on an assignment, and any notion of partial progress.
- **Undo.** No action anywhere is reversible, including delete.

### 3.2 Infrastructure the project has grown into needing

- **An ESLint configuration** that actually matches the declared `lint` script.
- **A test suite.** The Canvas parser alone — four formats, date coercion, deduplication, priority
  inference — is pure, self-contained logic and would be straightforward to cover; it is also where the
  worst bugs are.
- **CI.** A workflow running install, type-check, lint, and tests on pull requests.
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
