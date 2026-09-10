# Changelog

All notable changes to Evermind are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases before 3.0.0 predate this file. Their history is in the git log; `docs/audit.md` §6
records which audit findings each of them closed.

## [Unreleased]

### 3.0.0 — in progress

A breaking release. The schema changes, so an existing deployment must run the migrations
before the new code will work. See the upgrade section of
[`docs/self-hosting.md`](docs/self-hosting.md).

#### Added

- `supabase/upgrade/2_14_5_to_3_0_0.sql`, a one-shot upgrade for a database built by hand from
  `scripts/` — every 3.0.0 migration in a single transaction, so a failure halfway leaves nothing
  applied rather than a database that is half one version and half the other. It also covers what
  the migrations cannot: a deployment that never ran `002`, the length constraints under the names
  `docs/self-hosting.md` gave them for the whole of 2.x, and rows written before any length limits
  existed. Operators using the Supabase CLI do not need it.
- **Completed assignments are now removed automatically**, a month after you tick them off. Only
  completed work is ever touched — nothing pending is deleted however overdue it is, and reopening
  an assignment starts its clock again from zero. Settings → Assignments → Finished work states the
  policy, and General → Your Data exports everything first; deletion cannot be undone. The clean-up
  runs when you open Evermind rather than on a schedule, so the period is a floor and not an exact
  date. Two schema changes back it: `assignments.completed_at`, maintained by a trigger, and a
  `retention_settings` table. Existing completed assignments have their clock started at the moment
  the migration runs, not at their last edit, so nothing already in a database is deleted on the
  first load after upgrading.
- Database migrations are now managed by the Supabase CLI in `supabase/migrations/`, replacing
  hand-run numbered files. `scripts/*.sql` remain as the 2.x path and are frozen.
- `lib/database.types.ts`, generated from the schema, so the row types can no longer drift from
  the database. `bun run types:gen` regenerates it; `bun run types:check` fails on a diff.
- A `test` job in CI. The test suite has existed since 2.14.0 and CI has never run it.
- An app icon, touch icon, link-preview image and web manifest (audit **M4**). The previous
  metadata named four files that did not exist, so every page load fetched four 404s.
- Drag and drop on the Canvas upload box, which the label has claimed since it was written and
  nothing implemented — dropping a file used to navigate away from the page.
- Length limits on `title`, `subject` and `description`, which `docs/self-hosting.md` had been
  asking operators to apply by hand.
- 64 tests covering the Canvas importer, which had none.

#### Changed

- `@supabase/supabase-js` is pinned to 2.98.0 rather than `latest`, so a lockfile refresh
  cannot pull a major version into a deploy (audit **M13**).
- The add, edit and preview assignment dialogs share one `AssignmentForm`. They were three
  ~90 % identical copies, so every field the schema grows had to be written three times.
- The dashboard and `/preview` share one `AssignmentsBoard`. They were two copies of the same
  tabs, grid and empty states, and had already drifted.
- `components/settings-content.tsx` (1104 lines, ~20 pieces of state, five unrelated features)
  is now a 63-line tab shell over `components/settings/`, each panel owning its own state.
- SWR cache keys live in `lib/swr-keys.ts` and the browser-side reads in `lib/data/queries.ts`.
  `fetchAssignments` existed three times and the keys were string literals in five files.

#### Fixed

- `classes.name` was still capped at 100 characters, not the 200 the migration that widened it
  intended. The 100 comes from the column's inline `CHECK` in `scripts/002`, which that migration
  added `classes_name_length` alongside rather than replacing — and constraints are conjunctive,
  so the stricter one silently won. Reachable through `POST /api/v1/classes`, where a name of
  101–200 characters passed validation and was then refused by Postgres.
- Focus was dumped to `<body>` after every delete or edit from an assignment card's menu. The
  dialogs are opened from a dropdown item that no longer exists by the time they close, so
  Radix had nothing to restore focus to; it now returns to the card's own menu button.
- Submitting an assignment form with no subject or no due date did nothing at all — no message,
  no focus move, no indication which field was wrong. Both now report and take focus.
- The "Due Date" and "Priority" labels in all three dialogs pointed at controls that had no
  matching `id`, so the associations were dead. Field ids are now unique per form instance,
  which is also what stops two open dialogs colliding.
- Icon-only buttons with no accessible name: each card's actions menu (one per card, so a
  screen reader heard a column of identical unnamed buttons) and the week navigation arrows.
- Priority in the week strip was conveyed by the colour of a dot alone (WCAG 1.4.1), "today"
  by a border tint alone, and the `+n` badge announced only a number. The strip is now a list
  of days, each a list of assignments, with text alternatives throughout.
- Truncated titles and class names carry a `title` attribute; there was previously no way to
  read the rest of a clipped string.
- The light/dark switch in the theme editor was two buttons whose selected state was background
  colour alone, and arrow keys did not move between them. They are radio inputs now.
- The Canvas importer moved out of `components/settings-content.tsx` into `lib/import/canvas/`
  as pure functions, and now reports *why* a file could not be read rather than one catch-all
  message.
- The dashboard's status tab is carried in `?tab=`, so it survives navigation and can be
  linked, and its tab strip scrolls on narrow screens as the preview one already did.
- `created_at` and `updated_at` are `NOT NULL`, matching what every consumer already assumed.
- The Canvas import writes through `lib/data/assignments.ts` like every other write, instead of
  building its own insert with the user id taken from a prop.

#### Fixed

- The upload box offered CSV and IMSCC, which the picker had rejected since those parsers were
  removed (audit **L16**).
- Geist and Geist Mono were downloaded on every page load and never applied: `globals.css`
  named the families literally, and next/font generates a mangled name.
- `course-data.js` files failed to parse if anything followed the `COURSE_DATA` object — a
  greedy regex ran to the last `}` in the file. `var`, `const`, `globalThis.` and `self.`
  assignments are now read too, not just `window.`.
- Two assignments with the same title and due date in *different* courses were silently merged
  into one row by the import's duplicate check.
- Malformed XML reported "no assignments found in file" rather than saying the file was not
  valid XML; an unsupported file type said the same thing rather than naming the formats.
- Imported rows from an XML cartridge were all filed under "Imported" instead of the course
  named in the manifest, and a flat JSON export lost its points and so always imported as
  medium priority.
- "Select future" in the import preview compared dates in the browser's timezone rather than
  the one the app is set to, so it disagreed with the rows it had greyed out.

#### Removed

- `styles/globals.css`, `public/placeholder-user.jpg`, `public/placeholder.jpg`,
  `components/ui/use-toast.ts` and `components/ui/use-mobile.tsx` — all orphaned or stale
  duplicates of live files.
- Seven variables from `.example.env` that no code in the repository reads.

[Unreleased]: https://github.com/WickedSoftworks/evermind/compare/v2...v3
