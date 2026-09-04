-- Create classes table for Evermind
--
-- A student's own list of classes, used to fill the subject field on an
-- assignment quickly. Assignments still store `subject` as free text and hold
-- no reference to this table, so deleting a class never touches the work
-- already filed under its name.
--
-- Unlike 001, this file is safe to run more than once.
CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own classes.
-- Dropped first so re-running this file is not an error.
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
