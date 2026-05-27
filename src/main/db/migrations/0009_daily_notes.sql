-- Add daily_date column to notes table.
--
-- daily_date IS NULL  → regular note (shown in main Notes list)
-- daily_date NOT NULL → daily note (shown only in Daily mode)
--
-- The partial index covers only non-null rows — the common lookup path
-- is "give me all daily notes ordered by date" (Daily sidebar tree) and
-- "is there already a note for this date" (getOrCreateDaily).

ALTER TABLE notes ADD COLUMN daily_date TEXT;

CREATE INDEX IF NOT EXISTS notes_daily_date_idx
  ON notes(daily_date)
  WHERE daily_date IS NOT NULL;
