-- Finish the job `20260908120000_constrain_class_name_length.sql` started.
--
-- That migration added `classes_name_length CHECK (char_length(name) <= 200)`,
-- to match `assignments.subject` and the 200 that `lib/api/schemas.ts` accepts.
-- What it did not do is remove the limit that was already there.
--
-- `classes.name` is declared inline in the baseline — and in `scripts/002`
-- before it — as `TEXT NOT NULL CHECK (char_length(name) <= 100)`, which
-- Postgres names `classes_name_check`. Constraints are conjunctive: a row has
-- to satisfy every one of them. So the table currently carries both, the
-- stricter wins, and the effective limit is 100 — the number the newer
-- migration was written to replace.
--
-- Nothing has broken loudly because the settings form caps its input at 100
-- (`components/settings/classes-manager.tsx`). The path that does hit it is
-- `POST /api/v1/classes`, where a name of 101–200 characters passes validation
-- and is then refused by Postgres — which is the exact failure mode the earlier
-- migration's header describes and set out to fix: a rule enforced in one of
-- its two places reads as covered while the other path walks past it.
--
-- Dropping rather than re-adding: `classes_name_length` already says 200, and
-- one constraint per rule is the point.
--
-- Idempotent, and safe on a database that never had the 100 limit under that
-- name — DROP CONSTRAINT IF EXISTS is a no-op there.

BEGIN;

ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_name_check;

-- Re-asserted rather than assumed. On a database whose `classes` table predates
-- `20260908120000` and somehow never received it, dropping the 100 limit
-- without this would leave the column unbounded — strictly worse than the
-- state this migration is trying to correct.
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_name_length;
ALTER TABLE classes
  ADD CONSTRAINT classes_name_length CHECK (char_length(name) <= 200);

COMMIT;

-- ---------------------------------------------------------------------------
-- Verification — run separately, after the transaction has committed
-- ---------------------------------------------------------------------------
--
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'classes'::regclass AND contype = 'c'
--   ORDER BY conname;
--   -- exactly one row: classes_name_length, CHECK ((char_length(name) <= 200))
--
-- And the behaviour, as a signed-in user:
--
--   INSERT INTO classes (user_id, name) VALUES (auth.uid(), repeat('a', 150));
--   -- must succeed; before this migration it failed on classes_name_check
