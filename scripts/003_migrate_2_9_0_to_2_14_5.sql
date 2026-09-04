-- Migration: Evermind 2.9.0 -> 2.14.5
--
-- Brings a database created from `scripts/001_create_assignments_table.sql` at
-- version 2.9.0 up to what the application expects at 2.14.5. Three things
-- changed in that window:
--
--   1. `classes` — a new table behind the saved-class picker in Settings
--      (commit 93992cd). A 2.9.0 database does not have it, and Settings fails
--      to load the picker without it.
--
--   2. The `status` column still accepts 'overdue', which the code stopped
--      recognising (commit 4aa2bb9). Overdue is now derived from `due_date` at
--      read time, and `Status` in `lib/types.ts` is 'pending' | 'completed'
--      only. A row holding 'overdue' would appear in no tab at all.
--
--   3. The UPDATE policy on `assignments` still has no `WITH CHECK` (audit
--      C2). Commit 7d91787 meant to fix this but attached the clause to the
--      SELECT policy, after its terminating semicolon, where it is a syntax
--      error rather than a policy. So the hole is open in every deployment,
--      and any database created from 001 since that commit stopped executing
--      at that line — leaving the table with a SELECT policy and no INSERT,
--      UPDATE or DELETE policy, which makes the app read-only.
--
-- Safe to run more than once, and safe on a database that has already had
-- `002_create_classes_table.sql` applied. Everything below is one transaction:
-- if any step fails, none of it is applied.
--
-- Deliberately *not* here, because neither is part of the 2.9.0 -> 2.14.5
-- delta: the `updated_at` trigger (audit M3, still open) and the column length
-- constraints. Both are in `docs/self-hosting.md` if you want them.
--
-- Run it in the Supabase SQL editor.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The `classes` table
-- ---------------------------------------------------------------------------
-- The same statements as `002_create_classes_table.sql`, repeated rather than
-- referenced so this file is one thing to run. 002 is idempotent, so a
-- deployment that already applied it is unaffected by running this. Do not
-- edit these to follow 002 if 002 later changes — a migration describes the
-- schema at the version it shipped with.

CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

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

CREATE INDEX IF NOT EXISTS idx_classes_user_id ON classes(user_id);

-- One "Chemistry" per student, however they capitalised it the second time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_user_id_name ON classes(user_id, lower(name));

-- ---------------------------------------------------------------------------
-- 2. The `assignments` policies
-- ---------------------------------------------------------------------------
-- All four are dropped and recreated rather than only the UPDATE one, because
-- what a given deployment currently has depends on when it ran 001: before
-- 7d91787 it has all four (the UPDATE one missing its WITH CHECK), after it
-- has only the SELECT policy. Recreating all four lands both on the same
-- correct state, and makes this section re-runnable.
--
-- USING decides which rows may be targeted; WITH CHECK decides what the row is
-- allowed to look like afterwards. Postgres infers neither from the other, so
-- without the WITH CHECK an authenticated user can move one of their rows into
-- another account by updating `user_id`.

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

-- RLS is enabled by 001, but a table with policies and RLS switched off is
-- world-readable through the anon key, so it is worth being certain.
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

-- Belt and braces, if you want it: nothing in the app has ever changed
-- `user_id`, so the column can be made unwritable outright. The WITH CHECK
-- above already closes the hole; this only removes the ability to try.
--
-- REVOKE UPDATE (user_id) ON assignments FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3. The `status` column
-- ---------------------------------------------------------------------------
-- No released version ever wrote 'overdue' — it was in the union and the CHECK
-- constraint but never assigned — so this UPDATE is expected to match zero
-- rows. It runs first anyway, because the constraint below cannot be added
-- while a row violates it, and 'pending' is what such a row means: not done,
-- and late only because its due date has passed.

UPDATE assignments SET status = 'pending' WHERE status = 'overdue';

-- 001 declares the CHECK inline, so Postgres names it `assignments_status_check`.
-- Dropped by that name and re-added narrower. If your deployment has it under
-- some other name, that one stays and still permits everything this one does.
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_status_check;

ALTER TABLE assignments
  ADD CONSTRAINT assignments_status_check CHECK (status IN ('pending', 'completed'));

COMMIT;

-- ---------------------------------------------------------------------------
-- Verification — run separately, after the transaction has committed
-- ---------------------------------------------------------------------------
--
-- Row-level security must be on for both tables:
--
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('assignments', 'classes');
--
-- Eight policies, and every UPDATE and INSERT policy must show a with_check:
--
--   SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
--   WHERE tablename IN ('assignments', 'classes') ORDER BY tablename, cmd;
--
-- And nothing should be left holding the old status:
--
--   SELECT count(*) FROM assignments WHERE status NOT IN ('pending', 'completed');
