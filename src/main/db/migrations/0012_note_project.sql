-- Project membership for notes.
--
-- Projects become a cross-domain container: a note can belong to a project
-- the same way a task does (tasks.project_id, added in 0002). This adds the
-- parallel column to notes so a project's view can list both its tasks and
-- its notes.
--
-- Like notes.folder_id (see 0011), SQLite cannot add a FK constraint to the
-- notes table after the fact, so referential integrity for
-- notes.project_id -> projects.id is enforced in the service layer
-- (projectsService.delete nulls out project_id for the deleted project).
ALTER TABLE notes ADD COLUMN project_id TEXT;

CREATE INDEX IF NOT EXISTS notes_project_idx ON notes(project_id)
  WHERE project_id IS NOT NULL;
