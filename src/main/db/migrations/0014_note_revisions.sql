-- Note revision history (docs/specs/note-history.md).
--
-- Coalesced full-body snapshots of a note's title+body, captured by
-- notesService.update() on a time-interval trigger (not on every autosave —
-- see the spec for why). CASCADE so a hard-deleted note takes its history
-- with it; soft-deleted (trashed) notes keep their revisions.
CREATE TABLE IF NOT EXISTS note_revisions (
  id         TEXT NOT NULL PRIMARY KEY,
  note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS note_revisions_note_idx ON note_revisions(note_id, created_at);
