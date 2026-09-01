# Evermind — Architecture

How the application is put together, and why. Written against version 2.9.0.

For running your own copy, see [`self-hosting.md`](self-hosting.md). For known problems with what is
described here, see [`audit.md`](audit.md).

---

## 1. The shape of it

Evermind has no backend of its own. It is a Next.js front end and a Supabase project, and the browser talks
to Postgres directly.

```
                  ┌──────────────────────────────────────────┐
                  │  Browser                                 │
                  │  ┌────────────────────────────────────┐  │
                  │  │ React 19 client components         │  │
                  │  │  · SWR cache, key "assignments"    │  │
                  │  │  · supabase-js (anon key)          │──┼──── reads & writes ────┐
                  │  └────────────────────────────────────┘  │                        │
                  └───────────────▲──────────────────────────┘                        │
                                  │ HTML / RSC payload                                │
                  ┌───────────────┴──────────────────────────┐                        │
                  │  Next.js server (Node)                   │                        │
                  │  ┌────────────────────────────────────┐  │                        │
                  │  │ proxy.ts   — session refresh,      │  │                        │
                  │  │              route guards          │  │                        ▼
                  │  │ RSC pages  — first paint, auth     │──┼── reads ────►  ┌──────────────────┐
                  │  │ /auth/callback — OAuth code swap   │──┼── auth  ────►  │    Supabase      │
                  │  │ /api/account/delete — service role │──┼── admin ────►  │  Postgres + RLS  │
                  │  └────────────────────────────────────┘  │                │  GoTrue (auth)   │
                  └──────────────────────────────────────────┘                └──────────────────┘
                                                                                       ▲
                                                                          OAuth ───────┘
                                                                    (Google / Discord / GitHub)
```

The consequence worth internalising: **Row Level Security is the authorisation layer.** There is no server
route that mediates assignment reads or writes. If an RLS policy is wrong, the app is wrong — no amount of
client-side care compensates. This is why `scripts/001_create_assignments_table.sql` is the most
security-sensitive file in the repository.

---

## 2. Technology choices

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16, App Router | Server Components for first paint, client components for interaction. |
| Runtime | React 19 | `use client` boundaries are drawn low: pages are server components, lists and cards are client. |
| Language | TypeScript 5 | `strict` in `tsconfig.json`, but `ignoreBuildErrors` is on in `next.config.mjs`. |
| Styling | Tailwind CSS 4 | Configured through `@tailwindcss/postcss`; theme tokens are CSS custom properties in `app/globals.css`. |
| Components | shadcn/ui on Radix | Vendored into `components/ui`, configured by `components.json`. |
| Data (server) | `@supabase/ssr` server client | Cookie-backed, used by RSC pages. |
| Data (client) | `@supabase/supabase-js` + SWR | Single cache key, `mutate` after writes. |
| Auth | Supabase Auth (GoTrue), OAuth only | Google, Discord, GitHub. No password or magic-link flow exists. |
| Dates | date-fns 4 | Plus one hand-rolled UTC `Intl.DateTimeFormat` for hydration safety. |
| Analytics | `@vercel/analytics` | Mounted unconditionally in the root layout. |
| Package manager | Bun (`bun.lock` committed) | npm works; the lockfile will not be used. |

---

## 3. Request lifecycle

### 3.1 `proxy.ts` — the edge guard

Next.js 16 renamed middleware to **proxy**. `proxy.ts` at the repository root delegates to
`lib/supabase/proxy.ts`, which does two jobs on every non-static request:

1. **Refreshes the session.** It constructs a server Supabase client wired to the request/response cookie
   jars and calls `auth.getUser()`. That call refreshes an expiring access token and writes the rotated
   cookies onto the outgoing response. Without this, sessions would expire mid-visit.
2. **Routes by auth state**, before any page renders:

   | Path | Signed in | Signed out |
   |---|---|---|
   | `/` | → `/dashboard` | → `/preview` |
   | `/dashboard*` | render | → `/auth/login` |
   | `/auth*` | → `/dashboard` | render |
   | everything else | render | render |

   Note that `/settings` is **not** in this table — it is protected by its own check inside the page.

The matcher excludes `_next/static`, `_next/image`, `favicon.ico` and common image extensions.

There is a subtlety in the cookie plumbing worth preserving if you touch this file: when Supabase asks to set
cookies, the code writes them onto the *request* first, then rebuilds `NextResponse.next({ request })` so the
downstream render sees the fresh values, and only then copies them onto the response. Changing the order
breaks session refresh in ways that only show up under token expiry.

### 3.2 Server rendering

`app/dashboard/page.tsx` runs on the server, calls `supabase.auth.getUser()` (a second guard behind the
proxy — cheap insurance if the matcher is ever edited), then `fetchDashboardData(userId)` from
`lib/data/dashboard.ts`. The result is passed into `<AssignmentsList initialData={...} />` as props.

Every authenticated page is `export const dynamic = 'force-dynamic'`, because they all read cookies.

### 3.3 Client hydration and the SWR handoff

`AssignmentsList` is a client component holding the only SWR subscription in the app:

```ts
useSWR("assignments", fetchAssignments, {
  fallbackData: initialData,
  revalidateOnMount: !initialData,
})
```

The server-fetched array seeds the cache, so there is no loading spinner on first paint and no duplicate
fetch. Afterwards the client owns the data: every mutation calls `mutate("assignments")` and SWR refetches
through the browser Supabase client.

`"assignments"` is a bare string key used from four files (`assignments-list`, `assignment-card`,
`add-assignment-dialog`, `edit-assignment-dialog`, and `settings-content`). It is effectively a global; a
constant export would be safer.

---

## 4. Authentication

### 4.1 The flow

```
  /auth/login  ──signInWithOAuth(provider, redirectTo)──►  Supabase GoTrue
                                                                 │
                                                                 ▼
                                                    provider consent screen
                                                                 │
                                                                 ▼
        /auth/callback?code=…  ◄──────────────────────────────────┘
                 │
                 │  exchangeCodeForSession(code)  → sets HttpOnly session cookies
                 ▼
            /dashboard        (or /auth/error?error=… on failure)
```

`redirectTo` is computed client-side in `getRedirectUrl()` — and is currently hardcoded to a specific
production domain, which is the first thing a self-hoster must change. See audit finding **C1**.

### 4.2 The three Supabase clients

There are deliberately three, and using the wrong one is the easiest serious mistake to make in this
codebase:

| Module | Key | Runs in | Purpose |
|---|---|---|---|
| `lib/supabase/client.ts` | anon | browser | All user reads and writes. RLS applies. |
| `lib/supabase/server.ts` | anon | RSC / route handlers | Reads on behalf of the signed-in user via cookies. RLS applies. |
| `lib/supabase/admin.ts` | **service role** | server only | Bypasses RLS entirely. One caller: account deletion. |

`admin.ts` carries a comment saying it must never appear in a `"use client"` module; treat that as a hard
rule. A service-role key reaching the browser hands every row in the database to every visitor.

### 4.3 Account deletion

`POST /api/account/delete` is the only API route in the application:

1. Resolves the user from the session cookie — never from the request body, so the endpoint can only ever
   delete the caller.
2. Refuses with a clear 500 if `SUPABASE_SERVICE_ROLE_KEY` is unset, so a misconfigured deployment fails
   loudly rather than silently.
3. Calls `auth.admin.deleteUser(id)` with the service-role client. Assignments go with it: `user_id`
   references `auth.users(id) ON DELETE CASCADE`.
4. Signs the session out.

The client (`delete-account-dialog.tsx`) requires the user to type their own email address, then clears the
three `evermind-*` localStorage keys and redirects to login.

---

## 5. Data model

One table. `scripts/001_create_assignments_table.sql`:

```
assignments
  id          uuid   pk, default gen_random_uuid()
  user_id     uuid   not null → auth.users(id) on delete cascade
  title       text   not null
  subject     text   not null            -- free text, not a foreign key
  description text   null
  due_date    timestamptz not null
  priority    text   not null  check (low | medium | high)
  status      text   not null  check (pending | completed | overdue), default 'pending'
  created_at  timestamptz default now()
  updated_at  timestamptz default now()

indexes: user_id, due_date, status
rls:     enabled; four policies, one per verb, all auth.uid() = user_id
```

Two things about `status` are worth knowing before you write code against it:

- **`'overdue'` is never written.** The application derives overdue-ness at render time as
  `status !== 'completed' && isPast(due_date)`. The stored value is only ever `pending` or `completed`. A
  timestamp cannot be made stale by a database column, so this is the right decision — but the CHECK
  constraint and the TypeScript union both still advertise a third state that does not occur.
- **`updated_at` has no trigger.** It is set by the client on some write paths and not others.

`subject` being free text means there is no course entity: grouping, colour-coding and per-course filtering
all have nowhere to hang. Introducing a `courses` table is the single highest-leverage schema change
available.

---

## 6. Component layout

```
app/
  layout.tsx            root: fonts, three theme providers, Toaster, Analytics, FOUC scripts
  page.tsx              redirect fallback (the proxy normally handles "/")
  dashboard/page.tsx    RSC — auth guard + server fetch
  preview/page.tsx      RSC — generates mock data, revalidate = 3600
  settings/page.tsx     RSC — auth guard
  privacy/page.tsx      static
  auth/login            client — three OAuth buttons
  auth/callback         route handler — code → session
  auth/error            error display
  api/account/delete    route handler — service-role deletion

components/
  header.tsx                    nav, theme toggle, avatar menu, sign-out
  assignments-list.tsx          SWR owner; stats + weekly view + four tabs
  assignment-card.tsx           one assignment; complete / reopen / edit / delete
  stats-cards.tsx               the only pure server-renderable component here
  weekly-view.tsx               seven-day strip, week navigation
  add-/edit-assignment-dialog   forms (hand-rolled useState, not React Hook Form)
  preview-*                     in-memory mirrors of the above for /preview
  settings-content.tsx          1000 lines: account, imports, theming
  delete-account-dialog.tsx     typed-email confirmation
  *-provider.tsx                theme, compact mode, colour theme
  ui/                           60 vendored shadcn components (21 in use)

lib/
  supabase/{client,server,admin,proxy}.ts
  data/dashboard.ts     server-side fetch helpers
  types.ts              hand-written row types
  utils.ts              cn()
```

### Preview mode

`/preview` is a full parallel implementation, not a flag. `PreviewAssignmentsList` holds the array in
`useState`, and `AssignmentCard` accepts `isPreview` plus `onPreviewStatusChange` / `onPreviewDelete`
callbacks that replace the Supabase calls. The mock rows are generated relative to `new Date()` at render
time on the server, with `revalidate = 3600` so the "due in 2 days" labels do not freeze at build time.

The cost of the approach is that `assignments-list.tsx` and `preview-assignments-list.tsx` duplicate the same
filtering, tab structure and empty states, and drift is already visible (the preview `TabsList` has
`overflow-x-auto`; the real one does not).

---

## 7. Rendering and hydration

The server has no timezone. It renders in UTC; the visitor's browser does not. Three mechanisms keep this
from producing hydration mismatches, and all three are load-bearing:

1. **`useMounted()`** (`hooks/use-mounted.ts`) returns `false` for SSR and the first client render, `true`
   afterwards. Anything that depends on the visitor's clock renders a neutral placeholder until then. The
   weekly view renders seven skeletons rather than seven days.
2. **A UTC-pinned formatter.** `assignment-card.tsx` builds an `Intl.DateTimeFormat` fixed to
   `timeZone: "UTC"` that reproduces `format(date, "MMM d, yyyy")`. The first render uses it; post-hydration
   renders switch to relative labels ("Due today", "Due tomorrow").
3. **Blocking `<head>` scripts.** `compactModeScript` and `colorThemeScript` are injected via
   `dangerouslySetInnerHTML` and run before React hydrates, reading localStorage and setting the `compact`
   class and `--primary` / `--ring` custom properties. This prevents a flash of unthemed content that React
   cannot prevent, because React does not run before paint. `next-themes` does the same for light/dark.

The rule when adding a feature: **if it reads `Date.now()`, the visitor's timezone, or localStorage, it must
be gated behind `useMounted()` or handled by a head script.** The alternative is a hydration error in
production for every user outside UTC.

---

## 8. Theming

Three independent systems stacked on the same document element:

| System | Storage | Mechanism |
|---|---|---|
| Light / dark / system | `next-themes` (`theme` key) | `class="dark"` on `<html>` |
| Compact density | `evermind-compact-mode` | `class="compact"` on `<html>`; ~20 CSS overrides in `globals.css` |
| Colour theme | `evermind-color-theme`, `evermind-custom-themes` | inline `--primary` / `--ring` on `<html>` |

Eight built-in colour themes ship in `DEFAULT_CUSTOM_THEMES`, and users can add their own. On first run the
provider *copies* the built-ins into localStorage, then filters them back out of every list by id — so the
stored copy is redundant.

Each theme declares five colours. **Only `primary` is ever applied**, as `--primary` and `--ring`; the
settings UI likewise only exposes a primary-colour picker. See audit finding **M5**.

`app/globals.css` defines the token layer: `:root` for light, `.dark` for dark, `:root.compact` for density,
plus the shadcn semantic tokens (`--background`, `--foreground`, `--card`, `--muted`, `--destructive`, …) in
`oklch()`.

---

## 9. Build and deployment

`next.config.mjs`:

- `typescript.ignoreBuildErrors: true` — type errors do not fail the build.
- `images.unoptimized: true` — no Image Optimization API needed, so any host will do.
- `experimental.optimizePackageImports` for `lucide-react`, `date-fns`, several Radix packages and
  `recharts` — barrel-file tree shaking.
- `experimental.serverActions.bodySizeLimit: '2mb'` — inert; the app defines no Server Actions.
- `compiler.removeConsole` in production — including `console.error`.

Code splitting is manual: `WeeklyView` and `AddAssignmentDialog` are `React.lazy` in `assignments-list.tsx`,
`EditAssignmentDialog` in `assignment-card.tsx`, each behind a `<Suspense>` with a skeleton.

The application is a standard Node Next.js server (`next build` → `next start`). It has no filesystem state,
no background jobs and no websockets, so it scales horizontally without coordination. Vercel is the assumed
host — `@vercel/analytics` is wired in and the auth callback has a Vercel-shaped `x-forwarded-host` branch —
but nothing else depends on it.

---

## 10. What is deliberately absent

Useful to know so you do not go looking:

- **No API layer for assignments.** The browser is the client of Postgres. Adding a `/api/assignments` route
  would mean maintaining authorisation in two places.
- **No Server Actions.** Every mutation is a client-side Supabase call.
- **No global state manager.** SWR's cache is the store; React context covers only theming.
- **No form library**, despite `react-hook-form` being a dependency and `ui/form.tsx` being vendored.
- **No test suite, no ESLint config, no CI.**
- **No migration tooling.** One SQL file, run by hand in the Supabase SQL editor.
- **No server-side validation.** CHECK constraints and RLS are the only enforcement; everything else trusts
  the client.

---

## 11. Extending it

A few notes for the most likely changes.

**Adding a column.** Write `scripts/002_*.sql` rather than editing 001 — existing deployments have already
run it. Update `lib/types.ts` (or, better, switch to `supabase gen types typescript`). Insert paths that need
updating: `add-assignment-dialog.tsx`, `edit-assignment-dialog.tsx`, and the Canvas import in
`settings-content.tsx`.

**Adding a table.** Enable RLS on it in the same statement block that creates it, and write all four policies
with both `USING` and `WITH CHECK`. A table with RLS enabled and no policy is invisible; a table without RLS
enabled is world-readable through the anon key.

**Adding a protected page.** Add the path prefix to the proxy's guard list *and* call `auth.getUser()` in the
page. The proxy is a redirect for user experience; the page check is the actual guard.

**Adding a mutation.** Read the `{ error }` result and surface it through `toast()`. Then
`mutate("assignments")`. The existing call sites do not do the first part — do not copy them.

**Adding an import format.** The parser lives inline in `settings-content.tsx`. Lifting it into
`lib/import/` as pure functions over `string → ParsedAssignment[]` would make it testable, which it currently
is not, and would shrink the largest file in the repository.
