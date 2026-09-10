-- Automatic clean-up of completed assignments.
--
-- Two things, because neither is useful without the other:
--
--   1. `assignments.completed_at` — when a row was ticked off. The retention
--      clock has to start somewhere, and nothing in the schema recorded it.
--   2. `retention_settings` — how long each account keeps completed work.
--
-- ===========================================================================
-- WHY `completed_at` IS SET BY A TRIGGER AND NOT BY THE APPLICATION
-- ===========================================================================
--
-- The same reasoning as `handle_updated_at`, and the comment in
-- `lib/data/assignments.ts` that goes with it: a timestamp the client sends is
-- a timestamp every write path has to remember to send. There are already three
-- paths that can complete an assignment — the card menu, the edit dialog, and
-- `PATCH /api/v1/assignments/:id` in the commercial module — and the one that
-- forgets does not fail. It quietly writes a row whose deletion clock never
-- starts, or never stops.
--
-- So the database owns it. Complete a row and it is stamped; reopen it and the
-- stamp is cleared, which is what makes reopening a genuine reprieve rather
-- than a pause. Editing a row that is already complete leaves the stamp alone,
-- so fixing a typo in something you finished last week does not buy it another
-- month.
--
-- ===========================================================================
-- WHY THE BACKFILL USES NOW() AND NOT `updated_at`
-- ===========================================================================
--
-- `updated_at` is the obvious guess at when something was completed, and it is
-- a bad one here. For a row completed six months ago and untouched since, it
-- says six months ago — so the first sweep after this migration would delete it
-- immediately, along with most of the account's history, with no warning and no
-- undo. Guessing wrong in that direction is unrecoverable.
--
-- NOW() starts everyone's clock at the moment the feature arrives. It is not
-- the true completion date and does not pretend to be; it is the only value
-- that cannot destroy something the user has not been told about yet.
--
-- ===========================================================================
-- WHY `retention_settings` GETS SELECT AND NOTHING ELSE
-- ===========================================================================
--
-- Read the header of `pro/migrations/0001_purchases.sql` — this is the same
-- shape and the same reason. The browser holds a real Postgres role and talks
-- to PostgREST directly, so a `WITH CHECK (auth.uid() = user_id)` update policy
-- would let anyone set their own retention from the console. Changing this is
-- what the commercial edition sells; the policy every account gets by default
-- is not negotiable from the client.
--
-- Two independent locks again: no write policies, and the write grants revoked,
-- so a policy added here by accident still cannot be exercised.
--
-- Self-hosting note: an instance with no commercial module has nothing that can
-- write this table through the application, and every account on it therefore
-- keeps the default. That is deliberate rather than an oversight — but whoever
-- runs that instance holds the service-role key, and
--
--   INSERT INTO retention_settings (user_id, enabled) VALUES ('<uuid>', false)
--   ON CONFLICT (user_id) DO UPDATE SET enabled = false;
--
-- turns it off for an account permanently. `docs/self-hosting.md` says so too.
--
-- Idempotent throughout, so it is safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- assignments.completed_at
-- ---------------------------------------------------------------------------

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Before the trigger exists, so it is clear this value is chosen here and not
-- produced as a side effect. The trigger would compute the same thing anyway.
UPDATE assignments
  SET completed_at = NOW()
  WHERE status = 'completed' AND completed_at IS NULL;

-- The mirror image, for a database where an earlier run left a stamp on a row
-- that has since been reopened.
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
  -- evaluate the halves of an OR left to right. The short version reads better
  -- and would fail on whichever plan decided to look at `OLD` first.
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
-- retention_settings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS retention_settings (
  -- One row per account, or none at all. A missing row means the default, which
  -- is why nothing creates one on sign-up: the absence is a valid state and
  -- writing a row to say "unchanged" would be a lie waiting to go stale.
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- False keeps completed work forever. Only the commercial module can write
  -- this; see the header.
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,

  -- Days after completion, not after the due date. Deleting a week after
  -- something was *due* would delete work finished yesterday that had been
  -- sitting overdue, which is the opposite of what a clean-up is for.
  --
  -- The bounds are the same ones `lib/data/retention.ts` enforces. One day is
  -- the shortest thing that can be described honestly to a user; ten years is
  -- long enough that anyone who wants more wants `enabled = false`.
  delete_after_days INTEGER NOT NULL DEFAULT 30
                      CHECK (delete_after_days BETWEEN 1 AND 3650),

  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE retention_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_settings FORCE ROW LEVEL SECURITY;

-- The only policy this table gets. The settings page and the sweep both read
-- it from the user's own session; neither of them writes.
DROP POLICY IF EXISTS "Users can view their own retention settings" ON retention_settings;
CREATE POLICY "Users can view their own retention settings"
  ON retention_settings FOR SELECT
  USING (auth.uid() = user_id);

-- Deliberately absent: INSERT, UPDATE, DELETE. See the header.

REVOKE INSERT, UPDATE, DELETE ON retention_settings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON retention_settings FROM anon;
GRANT SELECT ON retention_settings TO authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- Verification — run separately, after the transaction has committed
-- ---------------------------------------------------------------------------
--
--   SELECT count(*) FROM assignments WHERE status = 'completed' AND completed_at IS NULL;
--   -- zero
--
--   SELECT count(*) FROM assignments WHERE status <> 'completed' AND completed_at IS NOT NULL;
--   -- zero
--
-- The trigger, end to end, on a row you do not mind losing:
--
--   UPDATE assignments SET status = 'completed' WHERE id = '<uuid>';
--   SELECT status, completed_at FROM assignments WHERE id = '<uuid>';
--   -- completed_at is now
--   UPDATE assignments SET title = title || ' (edited)' WHERE id = '<uuid>';
--   SELECT completed_at FROM assignments WHERE id = '<uuid>';
--   -- unchanged: editing is not renewing
--   UPDATE assignments SET status = 'pending' WHERE id = '<uuid>';
--   SELECT completed_at FROM assignments WHERE id = '<uuid>';
--   -- NULL: reopening clears it
--
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--   WHERE relname = 'retention_settings';
--   -- both booleans must be true
--
--   SELECT cmd, policyname FROM pg_policies WHERE tablename = 'retention_settings';
--   -- exactly one row, and cmd must be SELECT
--
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'retention_settings' AND grantee IN ('anon', 'authenticated')
--   ORDER BY grantee, privilege_type;
--   -- SELECT for authenticated, and nothing else for either role
--
-- And the assertion worth doing by hand, as a signed-in user in the SQL editor
-- with the anon key, not the service role:
--
--   INSERT INTO retention_settings (user_id, enabled) VALUES (auth.uid(), false);
--   -- must fail: permission denied for table retention_settings
