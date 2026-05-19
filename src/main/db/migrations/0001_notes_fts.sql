-- FTS5 search over note titles and bodies.
--
-- Standalone FTS5 table (not external-content mode) because notes.id is a
-- TEXT UUID — FTS5's `content_rowid` option requires an INTEGER. note_id
-- is stored as an UNINDEXED column so we can JOIN back to notes without
-- paying for tokenisation on a value we never search.
--
-- Tokeniser: porter (English stemming, per §6.1 "Stemming on") layered on
-- top of unicode61 (Unicode-aware case folding and diacritic removal).
-- The porter stemmer reduces "running" → "run", "cats" → "cat", etc., so
-- a single search term matches its inflected forms.

CREATE VIRTUAL TABLE notes_fts USING fts5(
  note_id UNINDEXED,
  title,
  body,
  tokenize = 'porter unicode61'
);
--> statement-breakpoint

-- Backfill: any notes that already exist (created before this migration
-- ran) need to be indexed. After this INSERT the FTS table is in sync;
-- the triggers below keep it that way for all future mutations.
--
-- Soft-deleted notes are still indexed — search queries filter them out
-- by joining `notes` and checking `deleted_at IS NULL`, which keeps the
-- trigger logic trivial (no need to track deleted_at transitions).
INSERT INTO notes_fts (note_id, title, body)
  SELECT id, title, body FROM notes;
--> statement-breakpoint

-- Sync triggers.
--
-- AFTER INSERT — append a row to the FTS table mirroring the new note.
CREATE TRIGGER notes_fts_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts (note_id, title, body)
    VALUES (new.id, new.title, new.body);
END;
--> statement-breakpoint

-- AFTER DELETE — only fires on hard deletes (DELETE FROM notes).
-- Soft deletes (UPDATE … SET deleted_at = …) leave the FTS row intact,
-- which is fine because the search query filters by deleted_at.
CREATE TRIGGER notes_fts_ad AFTER DELETE ON notes BEGIN
  DELETE FROM notes_fts WHERE note_id = old.id;
END;
--> statement-breakpoint

-- AFTER UPDATE — re-index title and body. We don't need to gate on which
-- column changed (FTS5 handles redundant writes cheaply) and the simpler
-- trigger is harder to get wrong.
CREATE TRIGGER notes_fts_au AFTER UPDATE ON notes BEGIN
  UPDATE notes_fts
     SET title = new.title, body = new.body
   WHERE note_id = old.id;
END;
