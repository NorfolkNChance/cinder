-- Bidirectional note <-> task links.
--
-- A user-curated many-to-many association so a "deep" note can link to the
-- tasks it spawned or relates to, and a task can surface the notes that give
-- it context. Distinct from tasks.source_note_id, which records the single
-- triage-capture provenance and is not user-editable.
--
-- Modelled on task_labels: composite PK doubles as the note->task lookup
-- index; a second index covers the task->note scan direction. Both FKs
-- CASCADE so deleting either side cleanly removes the association.
CREATE TABLE IF NOT EXISTS note_task_links (
  note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (note_id, task_id)
);

CREATE INDEX IF NOT EXISTS note_task_links_task_idx ON note_task_links(task_id);
