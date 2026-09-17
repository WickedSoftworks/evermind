-- Assignments point at the class they belong to.
--
-- `classes` has existed since the baseline and nothing has ever referenced it.
-- It is a convenience for the subject picker: a list of names, matched against
-- `assignments.subject` by lowercasing both. That works until somebody renames a
-- class, at which point every assignment stays filed under the old spelling and
-- the picker offers both — which is the bug this closes.
--
-- `subject` stays, and stays NOT NULL. Every component reads it, a freehand
-- subject with no matching class is an ordinary thing to have, and it is what
-- keeps an assignment readable after its class is deleted. `class_id` is
-- additive: a link where there is one to make.
--
-- ===========================================================================
-- THE FOREIGN KEY IS COMPOSITE, AND THAT IS THE INTERESTING PART
-- ===========================================================================
--
-- The obvious `class_id UUID REFERENCES classes(id)` is not enough here.
-- Row-level security on `assignments` asserts `auth.uid() = user_id` and nothing
-- about `class_id`, and the browser writes to PostgREST directly — so a
-- single-column key would let somebody file their own assignment under a
-- *stranger's* class id. Postgres would accept it, RLS would accept it, and
-- nothing would ever report it.
--
-- Carrying `user_id` into the key makes that combination non-existent in the
-- referenced table, so Postgres refuses it with no policy, trigger or server
-- route in the way. That is why `classes` gains a UNIQUE (id, user_id) it does
-- not otherwise need: a composite key needs something to point at.
--
-- **Requires PostgreSQL 15 or later**, for `ON DELETE SET NULL (class_id)`.
-- Without the column list Postgres nulls every column in the key, `user_id` is
-- NOT NULL, and deleting a class fails. Supabase's floor is 15 and
-- `supabase/config.toml` targets 17, so this is safe here — but it is the first
-- statement in this project to require a version, and `docs/self-hosting.md`
-- now says so.
--
-- Idempotent throughout, so it is safe to re-run.

BEGIN;

-- Something for the composite key to reference. Redundant on its own — `id` is
-- already unique — and there purely so the key below can include `user_id`.
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_id_user_id_key;
ALTER TABLE classes ADD CONSTRAINT classes_id_user_id_key UNIQUE (id, user_id);

-- Nullable, and permanently so: a subject typed freehand has no class to point
-- at, which is the ordinary case on the day this runs and stays valid forever.
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS class_id UUID;

-- Backfill by name. `lower(c.name)` rather than `lower(btrim(c.name))` because
-- that is the expression `idx_classes_user_id_name` is built on, so this uses
-- the index; class names are stored already trimmed, subjects are not, hence
-- `btrim` on that side only. The same case- and whitespace-insensitive rule
-- `useSubjectOptions` already uses to decide two names are the same one.
--
-- A subject matching nothing stays NULL. Inventing a class row here would put
-- classes somebody never saved into a table they curate by hand.
UPDATE assignments a
   SET class_id = c.id
  FROM classes c
 WHERE a.class_id IS NULL
   AND c.user_id = a.user_id
   AND lower(c.name) = lower(btrim(a.subject));

-- MATCH SIMPLE is the default, and it is what makes a nullable composite key
-- work at all: a row with `class_id IS NULL` is exempt from the constraint
-- regardless of `user_id`. Under MATCH FULL every unlinked assignment would
-- have to have both columns null, and `user_id` is NOT NULL.
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_class_id_fkey;
ALTER TABLE assignments
  ADD CONSTRAINT assignments_class_id_fkey
  FOREIGN KEY (class_id, user_id) REFERENCES classes(id, user_id)
  ON DELETE SET NULL (class_id);

-- Partial, because most rows are NULL and will stay that way for a while: only
-- assignments whose subject matched a saved class are linked.
CREATE INDEX IF NOT EXISTS idx_assignments_class_id
  ON assignments(class_id) WHERE class_id IS NOT NULL;

COMMIT;

-- ---------------------------------------------------------------------------
-- Verification — run separately, after the transaction has committed
-- ---------------------------------------------------------------------------
--
--   SELECT count(*) FILTER (WHERE class_id IS NOT NULL) AS linked,
--          count(*)                                     AS total
--   FROM assignments;
--   -- linked should match the number whose subject equals a saved class name
--
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'assignments_class_id_fkey';
--   -- must read FOREIGN KEY (class_id, user_id) REFERENCES classes(id, user_id)
--   -- ON DELETE SET NULL (class_id)
--
-- And the assertion worth doing by hand, as a signed-in user with the anon key
-- rather than the service role, using a class id belonging to another account:
--
--   UPDATE assignments SET class_id = '<somebody else''s class>' WHERE id = '<your own>';
--   -- must fail: insert or update violates foreign key constraint
--
-- Then delete a class that has assignments and confirm the rows survive with
-- `class_id` null and `subject` untouched. If that fails with "null value in
-- column user_id", the ON DELETE clause lost its column list.
