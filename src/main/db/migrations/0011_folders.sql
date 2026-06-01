-- Folders table.
--
-- folder_id was reserved in the notes table since the initial schema.
-- This migration creates the actual folders table and adds a FK index.
-- The notes.folder_id column already exists (added in 0000_init.sql);
-- SQLite cannot add a FK constraint to an existing column, so FK
-- integrity is enforced at the service layer instead.
CREATE TABLE IF NOT EXISTS folders (
  id         TEXT PRIMARY KEY NOT NULL,
  name       TEXT NOT NULL,
  parent_id  TEXT REFERENCES folders(id) ON DELETE SET NULL,
  "order"    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS folders_parent_idx ON folders(parent_id);
CREATE INDEX IF NOT EXISTS notes_folder_id_idx ON notes(folder_id)
  WHERE folder_id IS NOT NULL;
