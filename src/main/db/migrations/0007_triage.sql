-- Add triage flag to tasks.
-- Tasks created from notes land here (triage = 1) and stay hidden from
-- normal views until the user acknowledges them in the Triage screen.
ALTER TABLE tasks ADD COLUMN triage INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS tasks_triage_idx ON tasks(triage);
