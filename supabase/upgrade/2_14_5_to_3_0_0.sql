-- Migration: Evermind 2.14.5 -> 3.0.0
--
-- Everything in `supabase/migrations/` applied to a database built by hand from
-- `scripts/`, in one transaction, for an operator who is not using the Supabase
-- CLI.
--
-- ===========================================================================
-- DO YOU NEED THIS FILE?
-- ===========================================================================
--
--   Fresh 3.0.0 install                    No. Use the CLI, or run the four
--                                          files in `supabase/migrations/` in
--                                          filename order. There is nothing to
--                                          migrate.
--
--   Running 2.14.5, using the Supabase CLI No. `supabase migration repair
--                                          --status applied` for nothing, then
--                                          `supabase db push`. The migrations
--                                          are idempotent and land the same
--                                          schema this file does.
--
--   Running 2.14.5, ran `scripts/*.sql`    **Yes.** This is the one thing to
--   by hand in the SQL editor              run.
--
--   Running 2.9.0 or earlier               Run `scripts/003_migrate_2_9_0_to_
--                                          2_14_5.sql` first, then this.
--
-- ===========================================================================
-- WHY THIS EXISTS WHEN THE FOUR MIGRATIONS WOULD ALSO WORK
-- ===========================================================================
--
-- Running the four files in `supabase/migrations/` by hand does reach the same
-- schema, and for a while that was the whole of the upgrade advice. Four things
-- it does not give you:
--
--   1. **One transaction.** Four files are four transactions. The third failing
--      leaves a database that is half 2.14.5 and half 3.0.0, with no record of
--      which half. This is all or nothing.
--   2. **The hand-applied constraint names.** `docs/self-hosting.md` carried
--      the length limits as a snippet for years, under the names
--      `title_length`, `subject_length` and `description_length`. The 3.0.0
--      migration adds the same rules as `assignments_title_length` and friends
--      and does not know about the old names, so a deployment that took the
--      snippet ends up with two constraints per column saying the same thing.
--      This drops both spellings before adding one.
--   3. **Rows that predate the limits.** 2.x had no length limits at all, so a
--      real database can hold a title the 3.0.0 constraint will not accept, and
--      `20260904120100` has nothing to say about that — it was written for a
--      table with no rows in it. See "This script changes data" below.
--   4. **`classes` at all.** A database created from `001` alone never got it.
--
-- ===========================================================================
-- THIS SCRIPT CHANGES DATA. READ THIS PART.
-- ===========================================================================
--
-- 3.0.0 bounds four free-text columns that 2.x left unbounded. A row already
-- over the limit would make the constraint refuse to apply, so anything too
-- long is **truncated to fit**. Titles are cut at 300 characters, subjects and
-- class names at 200, descriptions at 10000.
--
-- Run this first and keep the output if it returns anything. It is the same
-- test the script uses, and nothing here changes the database:
--
--   SELECT 'assignments.title' AS what, id::text, char_length(title) AS len
--   FROM assignments WHERE char_length(title) > 300
--   UNION ALL SELECT 'assignments.subject', id::text, char_length(subject)
--   FROM assignments WHERE char_length(subject) > 200
--   UNION ALL SELECT 'assignments.description', id::text, char_length(description)
--   FROM assignments WHERE char_length(description) > 10000
--   UNION ALL SELECT 'classes.name', id::text, char_length(name)
--   FROM classes WHERE char_length(name) > 200;
--
-- No rows is the normal answer — the limits are generous and the forms that
-- write these columns are stricter than they are. If it does return something,
-- copy those values somewhere before continuing: the truncation is not
-- reversible and the script cannot ask you at the time.
--
-- The script reports what it cut with RAISE NOTICE as it goes.
--
-- One case can make this file fail rather than truncate, and it fails cleanly
-- with nothing applied: two of one user's classes whose names are identical for
-- their first 200 characters and differ after, which truncation would collapse
-- into a duplicate under `idx_classes_user_id_name`. Rename one and re-run.
--
-- ===========================================================================
-- WHAT IT DOES
-- ===========================================================================
--
--   1. `classes`, if the database never had it
--   2. Both tables' RLS policies, dropped and recreated
--   3. `status` narrowed to ('pending', 'completed')
--   4. Length limits on title, subject, description and class name
--   5. `created_at` / `updated_at` made NOT NULL
--   6. The `handle_updated_at` trigger
--   7. `completed_at`, its trigger and its index          <- new in 3.0.0
--   8. `retention_settings`                               <- new in 3.0.0
--
-- 1-6 are `20260904120000_baseline_schema.sql`,
-- `20260904120100_tighten_column_constraints.sql`,
-- `20260908120000_constrain_class_name_length.sql` and
-- `20260910130000_drop_superseded_class_name_check.sql`. 7-8 are
-- `20260910120000_assignment_retention.sql`. Read that last one's header before
-- running this: it is the only part of 3.0.0 that will go on to delete rows by
-- itself, and it explains what it will and will not take.
--
-- Idempotent throughout. Safe to run twice, and safe on a database that has
-- already had some of the individual migrations applied.
--
-- Run it in the Supabase SQL editor, or `psql -f`.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Is this the database you think it is?
-- ---------------------------------------------------------------------------
-- Without this the first failure would be `relation "assignments" does not
-- exist` from somewhere in the middle, which reads like a broken script rather
-- than the wrong target.

DO $$
BEGIN
  IF to_regclass('public.assignments') IS NULL THEN
    RAISE EXCEPTION
      'No `assignments` table here, so this is not an Evermind 2.x database. For a fresh install, run the files in supabase/migrations/ instead.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. `classes`, if it is missing
-- ---------------------------------------------------------------------------
-- A database created from `001` alone does not have it, and Settings cannot
-- load the saved-class picker without it. Written out rather than referenced so
-- this file is one thing to run.
--
-- The inline length CHECK the 2.x file carried is deliberately **not** repeated
-- here: section 4 adds `classes_name_length` at 200, and a second unnamed
-- constraint at 100 would silently win. That is the bug
-- `20260910130000_drop_superseded_class_name_check.sql` exists to fix, and
-- there is no reason to create it only to drop it four sections later.

CREATE TABLE IF NOT EXISTS classes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classes_user_id ON classes(user_id);

-- One "Chemistry" per student, however they capitalised it the second time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_user_id_name ON classes(user_id, lower(name));

-- ---------------------------------------------------------------------------
-- 2. Row-level security, and all eight policies
-- ---------------------------------------------------------------------------
-- Dropped and recreated rather than added conditionally, because what a 2.x
-- deployment currently has depends on when it ran `001`. Between 2026-09-03 and
-- 2.14.5 that file had a stray clause after the SELECT policy which made
-- Postgres stop there, leaving the table with a SELECT policy and no INSERT,
-- UPDATE or DELETE — an app that reads and cannot write. Recreating all eight
-- lands every history on the same state.
--
-- USING decides which rows may be targeted; WITH CHECK decides what a row is
-- allowed to become. Postgres infers neither from the other, so an UPDATE
-- policy without WITH CHECK lets a user move one of their rows into another
-- account by rewriting `user_id`. That was audit finding C2.

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own assignments" ON assignments;
CREATE POLICY "Users can view their own assignments"
  ON assignments FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own assignments" ON assignments;
CREATE POLICY "Users can insert their own assignments"
  ON assignments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own assignments" ON assignments;
CREATE POLICY "Users can update their own assignments"
  ON assignments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own assignments" ON assignments;
CREATE POLICY "Users can delete their own assignments"
  ON assignments FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own classes" ON classes;
CREATE POLICY "Users can view their own classes"
  ON classes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own classes" ON classes;
CREATE POLICY "Users can insert their own classes"
  ON classes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own classes" ON classes;
CREATE POLICY "Users can update their own classes"
  ON classes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own classes" ON classes;
CREATE POLICY "Users can delete their own classes"
  ON classes FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_assignments_user_id  ON assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due_date ON assignments(due_date);
CREATE INDEX IF NOT EXISTS idx_assignments_status   ON assignments(status);

-- ---------------------------------------------------------------------------
-- 3. `status`
-- ---------------------------------------------------------------------------
-- `001` permits 'overdue'; only `003`, the 2.9.0 upgrade path, ever narrowed
-- it. So a database that started fresh at 2.14.5 has a constraint one value
-- wider than `Status` in `lib/types.ts` allows.
--
-- No released version ever wrote 'overdue' — overdue is derived from
-- `due_date` at read time — so this UPDATE is expected to match zero rows. It
-- runs first because the narrowed constraint cannot be added while one exists,
-- and 'pending' is what such a row means.

UPDATE assignments SET status = 'pending' WHERE status = 'overdue';

ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_status_check;
ALTER TABLE assignments
  ADD CONSTRAINT assignments_status_check CHECK (status IN ('pending', 'completed'));

-- ---------------------------------------------------------------------------
-- 4. Length limits
-- ---------------------------------------------------------------------------
-- The database is the only place these can be enforced: assignment and class
-- writes go from the browser straight to PostgREST, so there is no server code
-- between a user and the column.
--
-- Truncation first, and it is reported. See the header — this is the one part
-- of the file that can lose something.

DO $$
DECLARE
  cut INTEGER;
BEGIN
  UPDATE assignments SET title = left(title, 300) WHERE char_length(title) > 300;
  GET DIAGNOSTICS cut = ROW_COUNT;
  IF cut > 0 THEN RAISE NOTICE 'Truncated % assignment title(s) to 300 characters.', cut; END IF;

  UPDATE assignments SET subject = left(subject, 200) WHERE char_length(subject) > 200;
  GET DIAGNOSTICS cut = ROW_COUNT;
  IF cut > 0 THEN RAISE NOTICE 'Truncated % assignment subject(s) to 200 characters.', cut; END IF;

  UPDATE assignments SET description = left(description, 10000) WHERE char_length(description) > 10000;
  GET DIAGNOSTICS cut = ROW_COUNT;
  IF cut > 0 THEN RAISE NOTICE 'Truncated % assignment description(s) to 10000 characters.', cut; END IF;

  UPDATE classes SET name = left(name, 200) WHERE char_length(name) > 200;
  GET DIAGNOSTICS cut = ROW_COUNT;
  IF cut > 0 THEN RAISE NOTICE 'Truncated % class name(s) to 200 characters.', cut; END IF;
END $$;

-- Two names each, and the second one is why this file exists. `title_length`
-- and friends are what `docs/self-hosting.md` told operators to apply by hand
-- through the whole of 2.x; `assignments_title_length` is what 3.0.0 calls the
-- same rule. Dropping both leaves exactly one constraint per column instead of
-- two identical ones.
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS title_length;
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_title_length;
ALTER TABLE assignments
  ADD CONSTRAINT assignments_title_length CHECK (char_length(title) <= 300);

ALTER TABLE assignments DROP CONSTRAINT IF EXISTS subject_length;
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_subject_length;
ALTER TABLE assignments
  ADD CONSTRAINT assignments_subject_length CHECK (char_length(subject) <= 200);

-- `description` is nullable. A CHECK against NULL evaluates to NULL, which
-- passes, so this bounds a description without requiring one.
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS description_length;
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_description_length;
ALTER TABLE assignments
  ADD CONSTRAINT assignments_description_length CHECK (char_length(description) <= 10000);

-- `classes_name_check` is the inline 100-character limit from `scripts/002`.
-- Constraints are conjunctive, so leaving it would hold the column at 100 while
-- `classes_name_length` claims 200 — see
-- `supabase/migrations/20260910130000_drop_superseded_class_name_check.sql`.
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_name_check;
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_name_length;
ALTER TABLE classes
  ADD CONSTRAINT classes_name_length CHECK (char_length(name) <= 200);

-- ---------------------------------------------------------------------------
-- 5. Timestamps that cannot be null
-- ---------------------------------------------------------------------------
-- `created_at` and `updated_at` are DEFAULT NOW() but nullable in 2.x, so
-- `supabase gen types` reports them as `string | null` while every consumer in
-- the app treats them as `string`. Nothing has ever written a null — you would
-- have to ask for one explicitly — so this tightens the columns to what the
-- code already assumes. The UPDATEs are there so the ALTERs cannot fail on a
-- row that somehow has one.

UPDATE assignments SET created_at = NOW() WHERE created_at IS NULL;
UPDATE assignments SET updated_at = COALESCE(created_at, NOW()) WHERE updated_at IS NULL;

ALTER TABLE assignments ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE assignments ALTER COLUMN updated_at SET NOT NULL;

UPDATE classes SET created_at = NOW() WHERE created_at IS NULL;

ALTER TABLE classes ALTER COLUMN created_at SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. `updated_at` belongs to the database
-- ---------------------------------------------------------------------------
-- `scripts/004` should already have done this at 2.14.5, but a database built
-- from `001` and `002` alone never got it, and the column would simply stop
-- moving: as of 2.14.5 no code path sets it.
--
-- Rows written before the trigger existed may have an `updated_at` older than
-- their last real edit. Nothing can recover the true times, so they are left
-- alone — a wrong timestamp is not improved by replacing it with today's.

CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

DROP TRIGGER IF EXISTS handle_updated_at ON assignments;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 7. `completed_at` — new in 3.0.0
-- ---------------------------------------------------------------------------
-- The retention clock has to start somewhere and nothing in the 2.x schema
-- recorded it. Set by a trigger, for the same reason `updated_at` is: three
-- code paths can complete an assignment and the one that forgets to stamp it
-- does not fail, it quietly writes a row whose clock never starts.
--
-- **The backfill is the part to understand before you run this.** `updated_at`
-- is the obvious guess at when something was completed and it is a bad one: for
-- a row completed six months ago and untouched since it says six months ago, so
-- the first sweep after this migration would delete it immediately, along with
-- most of the account's history. NOW() starts everyone's clock at the moment
-- you upgrade. It is not the true completion date and does not pretend to be;
-- it is the only value that cannot destroy something nobody has been told
-- about yet.
--
-- One visible side effect: the backfill is an UPDATE, so `handle_updated_at`
-- fires and every already-completed row's `updated_at` becomes the moment you
-- ran this. Nothing reads that column for anything a user sees, and the true
-- times were already unrecoverable for rows written before `scripts/004`.

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

UPDATE assignments
  SET completed_at = NOW()
  WHERE status = 'completed' AND completed_at IS NULL;

UPDATE assignments
  SET completed_at = NULL
  WHERE status <> 'completed' AND completed_at IS NOT NULL;

-- `search_path` is pinned empty so the function cannot be redirected by a
-- caller's schema search order. `now()` is in pg_catalog, which is always
-- searched regardless, so it still resolves.
CREATE OR REPLACE FUNCTION public.stamp_completed_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  -- Branched on TG_OP rather than written as `TG_OP = 'INSERT' OR OLD.status
  -- ...`, because `OLD` is null on an INSERT and PostgreSQL does not promise to
  -- evaluate the halves of an OR left to right.
  IF NEW.status <> 'completed' THEN
    -- Reopened, or never completed. Not "paused" — the clock is thrown away,
    -- and starts again from zero if this is completed a second time.
    NEW.completed_at := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.completed_at := now();
  ELSIF OLD.status IS DISTINCT FROM 'completed' THEN
    -- Newly complete on an update.
    NEW.completed_at := now();
  END IF;

  -- Falling through all three means the row was already complete and was merely
  -- edited. The stamp stays, so an edit is not a renewal.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS handle_completed_at ON assignments;
CREATE TRIGGER handle_completed_at
  BEFORE INSERT OR UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_completed_at();

-- The sweep's query, exactly: one user's completed rows, oldest first. Partial,
-- because pending rows are the overwhelming majority and are never candidates.
CREATE INDEX IF NOT EXISTS idx_assignments_completed_at
  ON assignments(user_id, completed_at)
  WHERE status = 'completed';

-- ---------------------------------------------------------------------------
-- 8. `retention_settings` — new in 3.0.0
-- ---------------------------------------------------------------------------
-- How long each account keeps completed assignments. A missing row means the
-- default — on, thirty days — which is why nothing creates one on sign-up.
--
-- SELECT and nothing else, and the write grants revoked as well as the policies
-- withheld. The browser holds a real Postgres role and talks to PostgREST
-- directly, so an update policy here would let anyone set their own retention
-- from the console. If you are running this instance for other people and want
-- to change the policy for one of them, `docs/self-hosting.md` §6 has the two
-- statements to do it with the service role.

CREATE TABLE IF NOT EXISTS retention_settings (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  delete_after_days INTEGER NOT NULL DEFAULT 30
                      CHECK (delete_after_days BETWEEN 1 AND 3650),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE retention_settings ENABLE ROW LEVEL SECURITY;

-- Belt and braces with FORCE, so the table owner is not silently exempt from
-- its own policies when a migration or a psql session connects as that role.
ALTER TABLE retention_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own retention settings" ON retention_settings;
CREATE POLICY "Users can view their own retention settings"
  ON retention_settings FOR SELECT
  USING (auth.uid() = user_id);

-- Deliberately absent: INSERT, UPDATE, DELETE.

REVOKE INSERT, UPDATE, DELETE ON retention_settings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON retention_settings FROM anon;
GRANT SELECT ON retention_settings TO authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- Verification — run separately, after the transaction has committed
-- ---------------------------------------------------------------------------
--
-- Every check on both tables, once each and with the right bounds:
--
--   SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid IN ('assignments'::regclass, 'classes'::regclass, 'retention_settings'::regclass)
--     AND contype = 'c'
--   ORDER BY 1, 2;
--   -- assignments:        assignments_description_length (10000),
--   --                     assignments_priority_check,
--   --                     assignments_status_check (pending, completed),
--   --                     assignments_subject_length (200),
--   --                     assignments_title_length (300)
--   --                     — five rows, and none of the bare `title_length` spellings
--   -- classes:            classes_name_length (200), and NOT classes_name_check
--   -- retention_settings: delete_after_days between 1 and 3650
--
-- The new column and its trigger:
--
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name = 'assignments' AND column_name = 'completed_at';
--   -- one row, timestamp with time zone, YES
--
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'assignments'::regclass AND NOT tgisinternal ORDER BY tgname;
--   -- handle_completed_at, handle_updated_at
--
--   SELECT count(*) FROM assignments WHERE status = 'completed' AND completed_at IS NULL;
--   SELECT count(*) FROM assignments WHERE status <> 'completed' AND completed_at IS NOT NULL;
--   -- zero and zero
--
-- Timestamps:
--
--   SELECT table_name, column_name, is_nullable FROM information_schema.columns
--   WHERE table_name IN ('assignments', 'classes')
--     AND column_name IN ('created_at', 'updated_at')
--   ORDER BY 1, 2;
--   -- is_nullable NO for all three
--
-- Row-level security, which is the one that matters if you get it wrong:
--
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--   WHERE relname IN ('assignments', 'classes', 'retention_settings');
--   -- relrowsecurity true for all three; relforcerowsecurity true for retention_settings
--
--   SELECT tablename, cmd, with_check IS NOT NULL AS has_with_check
--   FROM pg_policies WHERE tablename IN ('assignments', 'classes', 'retention_settings')
--   ORDER BY tablename, cmd;
--   -- nine rows: four per data table, one SELECT for retention_settings.
--   -- has_with_check true on both INSERT rows and both UPDATE rows
--
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'retention_settings' AND grantee IN ('anon', 'authenticated')
--   ORDER BY 1, 2;
--   -- SELECT for authenticated, and nothing else for either role
--
-- And the two worth doing by hand, signed in with the anon key rather than the
-- service role:
--
--   INSERT INTO retention_settings (user_id, enabled) VALUES (auth.uid(), false);
--   -- must fail: permission denied for table retention_settings
--
--   UPDATE assignments SET status = 'completed' WHERE id = '<a row you own>';
--   SELECT status, completed_at FROM assignments WHERE id = '<the same row>';
--   -- completed_at is now; setting status back to 'pending' clears it again
--
-- ---------------------------------------------------------------------------
-- Afterwards, if you want the CLI to take over
-- ---------------------------------------------------------------------------
--
-- The CLI tracks what it has applied in `supabase_migrations.schema_migrations`,
-- which a hand-built database does not have. This file has applied all five
-- migrations, so tell it so — all five, not just the baseline — before pushing
-- anything new:
--
--   supabase link --project-ref <your-project-ref>
--   supabase migration repair --status applied \
--     20260904120000 20260904120100 20260908120000 20260910120000 20260910130000
--   supabase db push        # should report nothing to do
--
-- Getting that list wrong is not dangerous — every one of those files is
-- idempotent, so a re-run changes nothing — but `db push` reporting "no
-- migrations to apply" is the confirmation that the two halves agree.
