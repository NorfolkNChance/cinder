-- Add source_note_id to tasks so triage tasks created from a note retain
-- a back-reference to their origin. ON DELETE SET NULL keeps the task alive
-- if the originating note is later deleted.
ALTER TABLE tasks ADD COLUMN source_note_id TEXT REFERENCES notes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tasks_source_note_idx ON tasks(source_note_id);
