-- Add body_type column to distinguish HTML notes from Markdown notes.
--
-- 'markdown' (default) — body is stored as CommonMark text; rendered by TipTap.
-- 'html'               — body is raw HTML; rendered in a sandboxed iframe,
--                        edited in a plain textarea.
--
-- All existing rows receive 'markdown' via the column default so no data
-- migration is needed.
ALTER TABLE notes ADD COLUMN body_type TEXT NOT NULL DEFAULT 'markdown';
