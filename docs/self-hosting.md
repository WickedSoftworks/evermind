# Evermind — Using and Self-Hosting

Two audiences in one document: §1 is for people using Evermind, §2 onward is for people running it.

Companion documents: [`architecture.md`](architecture.md) for how it works internally, [`audit.md`](audit.md)
for known defects — several of which you will meet during setup, so they are cross-referenced below.

---

## 1. Using Evermind

### Try it first

`/preview` gives you the complete interface loaded with sample assignments and no account. Everything works —
add, complete, delete, browse weeks — but nothing is saved. Reloading the page resets it. Signing out of
preview simply takes you to the login page.

### Signing in

Sign-in is OAuth only: Google, Discord, or GitHub. There is no password, no email/magic-link option, and no
account creation step — the first sign-in with a provider creates the account. Which providers appear depends
on what the operator has enabled in their Supabase project.

### The dashboard

Four summary tiles across the top — **Total**, **Pending**, **Completed**, **Overdue**.

Below them, a **week strip**: seven day cards, today outlined, each showing up to two upcoming assignments as
a coloured dot (green = low, amber = medium, rose = high) plus the title, with a `+n` badge when there are
more. Arrows move a week at a time; **Today** returns to the current week. Completed assignments are hidden
from the strip.

Then four tabs — **Pending**, **Overdue**, **Completed**, **All** — each a grid of assignment cards.

Note that **overdue is computed, not stored**: an assignment is overdue when its due date has passed and it
is not completed. It moves from Pending to Overdue on its own; nothing needs to run.

### Assignments

**Adding one:** *Add Assignment* opens a dialog with title, subject, an optional description, a date picker,
a time (defaulting to 23:59), and a priority. Title, subject, date and time are required.

**Acting on one:** the `⋮` menu on each card offers Edit, Mark complete / Reopen, and Delete.

> **Delete is immediate and permanent.** There is no confirmation and no undo. Take care with that menu item.

Cards show a truncated title and a two-line description clamp, so long text is not fully visible on the card;
open Edit to read it all.

### Importing from Canvas

**Settings → Assignments → Canvas Import.** Export your course data from Canvas and upload the file. Four
formats are accepted:

| Format | What it is | Reliability |
|---|---|---|
| `course-data.js` | A Canvas `window.COURSE_DATA = {…}` dump | Best supported — use this if you can get it. |
| `.json` | Canvas JSON export, or a plain array of assignment objects | Good. |
| `.csv` | A spreadsheet export | **Unreliable** — see the warning below. |
| `.xml` / `.imscc` | IMS Common Cartridge | `.imscc` does not work at all (audit **H4**). |

After parsing you get a preview dialog listing what was found, with **Select All**, **Select Future** (skips
anything already past) and per-row checkboxes. Nothing is written until you confirm.

> **CSV caveat.** The CSV parser mishandles unquoted multi-word cells and skips empty ones, which shifts every
> later column (audit **H3**). Always read the preview list carefully before importing, and prefer the `.js`
> or `.json` export. Imported assignments also lose their time of day and land at midnight.

Everything imported arrives as **medium** priority (except from `course-data.js` and JSON, where priority is
inferred from points available) with status **pending**. Re-importing the same file creates duplicates —
there is no matching against existing rows.

**Google Classroom** appears in the same tab with a Connect button. It is not implemented; the button pops a
notice saying so.

### Appearance

- **Theme mode** — Light, Dark, or System.
- **Colour palette** — a default plus eight built-ins (Ocean, Forest, Sunset, Lavender, Plasma, Night Swim,
  Mint, Candy). These change the **accent colour only**; the names suggesting full palettes are aspirational
  (audit **M5**).
- **Custom themes** — name it, pick a primary colour, save. Edit and delete from the list.
- **Compact mode** — tightens padding and spacing throughout.

All appearance settings live in your browser's localStorage, not in the database. They do not follow you to
another device or browser, and clearing site data resets them.

### Your account and your data

**Settings → General** shows your email, display name, avatar, account creation date, last sign-in and auth
provider. None of it is editable in the app — it comes from your OAuth provider.

**Deleting your account** is in the Danger Zone: type your email address to confirm. This deletes the auth
user, and every assignment cascades away with it. It is immediate and irreversible. Your local appearance
settings are cleared too.

There is **no export feature**. If you want your data out, take it from the database before deleting the
account, or ask the operator.

---

## 2. Before you host it

Requirements:

- **Bun** (a `bun.lock` is committed) or **Node.js 20+** with npm.
- A **Supabase** project — the free tier is enough for personal or small-group use.
- **A domain with HTTPS** if the instance is public. OAuth providers will not redirect to plain HTTP outside
  localhost.
- OAuth credentials for at least one of Google, Discord, or GitHub.

What you are signing up for operationally: a stateless Node process, a Postgres database, and OAuth app
registrations. No background workers, no queues, no file storage, no cron. Backups are Supabase's problem;
uptime is your host's.

**Licence:** GPL-3.0. If you distribute a modified version — and running a public instance of a modified copy
is a case worth taking advice on — the source must be available under the same terms.

---

## 3. Setup

### 3.1 Get the code

```bash
git clone https://github.com/<your-username>/evermind.git
cd evermind
bun install          # or: npm install
```

### 3.2 Create the Supabase project

Create a project at [supabase.com](https://supabase.com). From **Project Settings → API**, note:

- the **Project URL**,
- the **anon / public** key,
- the **service_role** key.

> The anon key is designed to be public — it is shipped to every browser and is safe only because Row Level
> Security constrains it. **The service_role key bypasses RLS completely.** Anyone holding it can read and
> modify every row belonging to every user. It must never be prefixed `NEXT_PUBLIC_`, never be logged, and
> never appear in client code. Evermind uses it in exactly one place: `lib/supabase/admin.ts`, imported only
> by the account-deletion route.

### 3.3 Create the schema

Open the Supabase **SQL Editor** and run `scripts/001_create_assignments_table.sql`. It creates the
`assignments` table, three indexes, enables RLS, and adds four policies.

The UPDATE policy carries its `WITH CHECK` clause as of 2.14.5 (audit **C2**), so there is no longer a
correction to apply by hand here. If you created your database before then, see **Upgrading an existing
database** below — the clause is missing and a user can reassign one of their rows to another account.

Two things are still worth adding at the same time — an `updated_at` trigger and length limits, neither of which the
schema has:

```sql
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE PROCEDURE extensions.moddatetime (updated_at);

ALTER TABLE assignments
  ADD CONSTRAINT title_length       CHECK (char_length(title)       <= 300),
  ADD CONSTRAINT subject_length     CHECK (char_length(subject)     <= 200),
  ADD CONSTRAINT description_length CHECK (char_length(description) <= 10000);
```

Then run `scripts/002_create_classes_table.sql`. It creates the `classes` table behind the saved-class
picker in Settings: the same four RLS policies, plus a unique index on `(user_id, lower(name))` so the same
class cannot be saved twice under different capitalisation. Assignments still store their subject as free
text and hold no reference to this table, so deleting a class never touches existing assignments.

Note that `scripts/001_...sql` is **not idempotent** — the `CREATE POLICY` statements will error if you run
the file twice. Run it once on a fresh project. `002` drops each policy before creating it, so it can be
re-run safely; new migrations should follow that pattern rather than 001's.

**Upgrading an existing database.** A database created at 2.9.0 or earlier needs
`scripts/003_migrate_2_9_0_to_2_14_5.sql` instead of the two files above: it adds the `classes` table,
repairs the `assignments` policies (including the missing `WITH CHECK`), and narrows the `status` constraint
to the two values the code still recognises. It is one transaction and safe to run more than once, including
on a database that has already had `002` applied.

Databases created from `001` between 2026-09-03 and 2.14.5 are a special case worth checking for: that
version of the file had a stray clause after the SELECT policy which made Postgres stop there, so the table
ended up with a SELECT policy and no INSERT, UPDATE or DELETE policy — an app that reads but cannot write.
Running `003` repairs that too. The verification query below will show you which case you are in.

Verify RLS is on before going live:

```sql
SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('assignments', 'classes');
-- relrowsecurity must be true for both
```

If that returns `false`, every row in the table is readable by anyone with the anon key.

And that the policies themselves are all there:

```sql
SELECT tablename, cmd, with_check IS NOT NULL AS has_with_check
FROM pg_policies WHERE tablename IN ('assignments', 'classes') ORDER BY tablename, cmd;
```

Expect eight rows — four per table, one for each of SELECT, INSERT, UPDATE and DELETE — with
`has_with_check` true on both INSERT rows and both UPDATE rows. Fewer rows than that, or an UPDATE without
its check, means the schema needs `003`.

### 3.4 Configure the environment

```bash
cp .example.env .env.local
```

Fill in:

```ini
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

Those three are all the application actually reads. `SUPABASE_SERVICE_ROLE_KEY` is optional in the sense that
the app boots without it — but account deletion will return *"Account deletion is not configured on this
server"* until it is set, and the README omits it entirely.

The remaining entries in `.example.env` — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`,
`SESSION_SECRET`, `DISCORD_*`, `GITHUB_*` — are **not read by any code in this repository** (audit **L15**).
OAuth secrets go into the Supabase dashboard, not into your `.env.local`. You can leave them blank or delete
them.

`.gitignore` covers `.env*`, so `.env.local` will not be committed. Check anyway before your first push.

### 3.5 Fix the hardcoded callback URL

**This step is not optional for anything other than `localhost:3000`.**

`app/auth/login/page.tsx` hardcodes the sign-in redirect to the original author's production domain
(audit **C1**). Left as-is, your users are sent to somebody else's site to finish signing in, and it fails
there. Replace `getRedirectUrl` with:

```ts
const getRedirectUrl = () =>
  `${process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin}/auth/callback`
```

Then set `NEXT_PUBLIC_SITE_URL=https://your-domain.example` in production if you want a fixed value, or leave
it unset and let the current origin decide (which handles preview deployments and non-3000 ports for free).

While you are in the auth code, consider also applying audit **H1** to `app/auth/callback/route.ts` —
removing the `x-forwarded-host` branch and validating the `next` parameter — before exposing the instance
publicly.

### 3.6 Set up OAuth providers

In Supabase, **Authentication → URL Configuration**:

- **Site URL:** `https://your-domain.example`
- **Redirect URLs:** add every origin that will complete a sign-in —
  `http://localhost:3000/auth/callback` and `https://your-domain.example/auth/callback`, plus any preview
  domains.

Then **Authentication → Providers**, enabling at least one:

| Provider | Where to register | Authorised redirect URI |
|---|---|---|
| Google | [Google Cloud Console](https://console.cloud.google.com/) → Credentials → OAuth client ID (Web) | `https://<project-ref>.supabase.co/auth/v1/callback` |
| GitHub | Settings → Developer settings → OAuth Apps | `https://<project-ref>.supabase.co/auth/v1/callback` |
| Discord | [Discord Developer Portal](https://discord.com/developers/applications) → OAuth2 | `https://<project-ref>.supabase.co/auth/v1/callback` |

The redirect the *provider* needs is Supabase's `/auth/v1/callback`, not your app's `/auth/callback`. Paste
each client ID and secret into the matching Supabase provider panel.

If you enable fewer than three providers, remove the unused buttons from `app/auth/login/page.tsx` — they are
rendered unconditionally and will fail with a provider error when clicked.

### 3.7 Run it

```bash
bun run dev          # http://localhost:3000
```

`bun run lint` will fail: the script calls `eslint .` but the repository has no ESLint config and no ESLint
dependency (audit **M12**). Ignore it, or add a config.

Check before deploying:

- `/preview` renders with sample data.
- Each enabled provider completes sign-in and lands on `/dashboard`.
- Add, edit, complete and delete an assignment; confirm the row in the Supabase table editor.
- Sign in as a **second** user and confirm you cannot see the first user's assignments. This is the RLS test —
  do not skip it.
- Account deletion in Settings → Danger Zone removes both the auth user and their rows.

---

## 4. Deploying

### Vercel

The path of least resistance — the project is shaped for it.

1. Import the repository.
2. Add the three environment variables. Mark `SUPABASE_SERVICE_ROLE_KEY` as sensitive and do **not** expose it
   to preview builds you would not trust.
3. Deploy, then add the resulting domain to Supabase's Site URL and Redirect URLs.

`@vercel/analytics` is mounted in the root layout and will start reporting automatically. To remove it, delete
the `<Analytics />` element from `app/layout.tsx` and drop the dependency.

### Any Node host

`next build` produces a standard server; `next start` runs it on `PORT` (default 3000).

```bash
bun run build
bun run start
```

Put it behind a reverse proxy terminating TLS. `images.unoptimized: true` means no sharp, no image
optimisation service, and no special routing.

### Docker

A `Dockerfile` and a `compose.yaml` ship with the project. With `.env.local` filled in:

```bash
docker compose --env-file .env.local up --build
```

The `--env-file` is not optional. Compose reads `.env` for the `${...}` substitutions in `compose.yaml`, and
this project keeps its configuration in `.env.local`, so without it the two build arguments arrive empty and
the build stops and tells you so.

There is no database service in the compose file. Evermind talks to Supabase for Postgres, Auth and RLS;
a bare Postgres container would give it none of those.

**`NEXT_PUBLIC_*` values are substituted into the JavaScript at build time**, not read when the server
starts, so they are build arguments and changing either one means rebuilding rather than restarting.
Everything else — `SUPABASE_SERVICE_ROLE_KEY` above all, which bypasses row-level security for every user —
is read at runtime and comes from `env_file`, so that it never exists in an image layer.

The image builds with bun, matching the lockfile and CI, and runs the compiled `.next/standalone` server on
Node: by then nothing is being compiled, and Next's standalone entrypoint is written against Node's runtime.
Both stages are Alpine so the musl builds of SWC, lightningcss and Tailwind's oxide binary match. To run
everything on bun instead, change the last stage's base image to `oven/bun:1.4.0-alpine` and its command to
`["bun", "server.js"]`.

Standalone output is opt-in, through `BUILD_STANDALONE=1` in `next.config.mjs`. The Dockerfile sets it; a
Vercel build does not, and is unaffected.

---

## 5. Hardening a public instance

The defaults are fine for a personal instance. If other people will use it, do these as well.

**Add security headers.** There are none. In `next.config.mjs`:

```js
async headers() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    ],
  }]
}
```

A Content-Security-Policy is worth adding too, but the two inline `<head>` theme scripts need a nonce or a
hash, so it takes a little more work than a copy-paste.

**Turn type checking back on.** Remove `typescript.ignoreBuildErrors` from `next.config.mjs` and fix whatever
surfaces. Shipping a build you have never type-checked is a choice with no upside.

**Keep server error logs.** `compiler.removeConsole` strips `console.error` in production, including the only
diagnostic in the account-deletion route. Use `removeConsole: { exclude: ['error'] }`.

**Rate limit.** The two `/api/account/*` routes are throttled in `lib/security/rate-limit.ts`: ten exports
and five deletion attempts per user per ten minutes, behind a coarse cap of thirty requests per minute per
address. The counters live in the instance's own memory, so a serverless deployment running several
instances multiplies the effective limit and a cold start clears it — treat it as a guard against a runaway
client, not against a distributed attacker. A busy public instance wants a proxy-level limit on `/api/*` or
a shared store instead.

Everything else is unthrottled, and most of it cannot be throttled here: assignment writes and the Canvas
import go from the browser straight to Postgres without passing through this app at all. Sign-in is
Supabase's, with its own limits under Authentication → Rate Limits — raise or lower those to taste.

**Pin `@supabase/supabase-js`.** It is specified as `"latest"`. Pin it to the version your lockfile resolved
so a lockfile refresh cannot pull a major version into a deploy.

**Decide about open registration.** Any Google, GitHub or Discord account can sign in and create data. There
is no allow-list, no invite mechanism, and no admin interface. If the instance is meant for a limited group,
add a Supabase Auth Hook rejecting sign-ups outside your allowed domains, or restrict the OAuth app itself.

**Update the privacy policy.** `app/privacy/page.tsx` is hardcoded with the original author's contact address
(`data@evermind.today`) and describes their service. If you host a public instance, it is your privacy policy
now — the contact address, the operator identity and the data-export promise all need to reflect what you
actually do.

**Back up.** Supabase's free tier retains limited backups. `pg_dump` on a schedule, held somewhere else, is
the difference between an incident and a disaster.

---

## 6. Operating it

**Where things live.** All persistent state is the `assignments` table plus Supabase's `auth.users`. There is
no server-side session store, no cache to warm, no uploads directory. Appearance preferences live in each
user's browser and are not backed up by anything.

**Useful queries.**

```sql
-- Users and how much they are tracking
SELECT u.email, count(a.id) AS assignments, max(a.created_at) AS last_added
FROM auth.users u LEFT JOIN assignments a ON a.user_id = u.id
GROUP BY u.email ORDER BY assignments DESC;

-- Export one user's data (the app has no export feature)
SELECT json_agg(a) FROM assignments a
WHERE a.user_id = (SELECT id FROM auth.users WHERE email = 'someone@example.com');

-- Rows that will never be actioned: overdue by more than 90 days
SELECT count(*) FROM assignments
WHERE status <> 'completed' AND due_date < now() - interval '90 days';
```

**Upgrading.** Pull, `bun install`, run any new files in `scripts/` in order, rebuild. Coming from 2.9.0 or
earlier, `003_migrate_2_9_0_to_2_14_5.sql` is the only one you need — it covers `002` as well. There is no migration
runner and no schema version tracking, so keep your own note of which SQL files you have applied.

**Removing a user.** Deleting the row from `auth.users` cascades to their assignments. The in-app Danger Zone
does the same thing through the API.

---

## 7. Troubleshooting

| Symptom | Cause |
|---|---|
| Sign-in redirects to `evermind.shxrk.dev` | §3.5 not applied. The callback URL is hardcoded. |
| `redirect_uri_mismatch` from the provider | The provider's authorised redirect must be `https://<project-ref>.supabase.co/auth/v1/callback`, not your app's URL. |
| Lands on `/auth/error?error=auth_callback_failed` | Your app origin is missing from Supabase → Authentication → URL Configuration → Redirect URLs. |
| Signed in, but the dashboard is empty and adding does nothing | RLS policies missing or `auth.uid()` not matching `user_id`. Re-run the policy block from §3.3 and check the browser console. |
| Adding an assignment silently does nothing | Writes discard their errors (audit **H2**), so failures are invisible in the UI. Check the browser network tab for the failing PostgREST call. |
| "Account deletion is not configured on this server" | `SUPABASE_SERVICE_ROLE_KEY` is unset in the runtime environment. |
| Import finds nothing | Wrong format, or the CSV parser misread the columns (audit **H3**). Try the `.js` or `.json` export. `.imscc` never works (audit **H4**). |
| Dates show one day off before the page settles | Known: first render is UTC-pinned, then swaps to local after hydration (audit **M1**). |
| Colour theme flashes on load | The FOUC script only knows five of the eight built-ins (audit **M6**). Affects Night Swim, Mint and Candy. |
| Selecting "Plasma" or "Night Swim" does not go dark | Only the accent colour is applied; the rest of each palette is unused (audit **M5**). Use Theme Mode → Dark. |
| 404s for `/icon.svg`, `/apple-icon.png` | Those files are referenced in `app/layout.tsx` but absent from `public/` (audit **M4**). Add your own or remove the `icons` block. |
| `bun run lint` fails immediately | No ESLint config or dependency exists (audit **M12**). |
