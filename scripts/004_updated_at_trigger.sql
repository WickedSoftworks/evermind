-- Move `updated_at` off the client and onto the database (audit M3).
--
-- Until now the column was set by hand in whichever code path happened to
-- remember: the edit dialog and complete/reopen did, the Canvas import did not,
-- and anything writing outside the UI — the SQL editor, a future API, a repair
-- script — never could. A modification timestamp the client supplies is also
-- one the client can put anywhere it likes.
--
-- `moddatetime` is the contrib extension Supabase ships for exactly this. It
-- writes the transaction timestamp into the named column on every UPDATE,
-- whatever the statement said that column should be, so the application no
-- longer sends it at all.
--
-- INSERT is not covered here and does not need to be: `updated_at` already
-- defaults to NOW() in 001.
--
-- Safe to run more than once. Run it on a fresh install after 001 and 002, or
-- after 003 when upgrading from 2.9.0 or earlier.

BEGIN;

-- Supabase keeps extensions out of `public`; the schema exists on every project.
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

DROP TRIGGER IF EXISTS handle_updated_at ON assignments;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- Rows written before the trigger existed may have an `updated_at` older than
-- their last real edit, or equal to `created_at` because the import never set
-- it. Nothing can recover the true times, so they are left alone: a wrong
-- timestamp is not improved by replacing it with today's.

COMMIT;

-- ---------------------------------------------------------------------------
-- Verification — run separately, after the transaction has committed
-- ---------------------------------------------------------------------------
--
--   SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgrelid = 'assignments'::regclass AND NOT tgisinternal;
--
-- One row, `handle_updated_at`, with tgenabled = 'O'.
--
-- To watch it work, on a row you own:
--
--   UPDATE assignments SET updated_at = '2000-01-01' WHERE id = '<some id>'
--   RETURNING updated_at;
--
-- It must come back as now, not 2000 — the trigger overrides what was sent.
