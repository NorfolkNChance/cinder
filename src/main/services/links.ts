import { and, eq, isNull } from 'drizzle-orm';
import { getDrizzle } from '../db/drizzle';
import { noteTaskLinks, notes, tasks } from '../db/schema';
import type { Note } from '../../shared/schemas/notes';
import type { Task } from '../../shared/schemas/tasks';
import type {
  LinkCreateInput,
  LinkDeleteInput,
} from '../../shared/schemas/links';

/**
 * Note ↔ Task links service.
 *
 * Manages the user-curated many-to-many association between notes and tasks
 * (the `note_task_links` table). This is separate from `tasks.source_note_id`,
 * which records the single triage-capture provenance.
 *
 * Conventions:
 *   - `create` is idempotent — re-linking an existing pair is a no-op rather
 *     than a PK-violation error (ON CONFLICT DO NOTHING).
 *   - List queries exclude soft-deleted notes/tasks so a deleted-but-not-yet-
 *     hard-purged row never surfaces as a phantom link. (FK CASCADE only
 *     fires on hard delete, which these tables use a separate schedule for.)
 */

function nowIso(): string {
  return new Date().toISOString();
}

export const linksService = {
  async create(input: LinkCreateInput): Promise<void> {
    const db = getDrizzle();
    await db
      .insert(noteTaskLinks)
      .values({
        noteId: input.noteId,
        taskId: input.taskId,
        createdAt: nowIso(),
      })
      .onConflictDoNothing();
  },

  async delete(input: LinkDeleteInput): Promise<void> {
    const db = getDrizzle();
    await db
      .delete(noteTaskLinks)
      .where(
        and(
          eq(noteTaskLinks.noteId, input.noteId),
          eq(noteTaskLinks.taskId, input.taskId),
        ),
      );
  },

  /** Tasks linked to a note (excludes soft-deleted tasks). */
  async listForNote(noteId: string): Promise<readonly Task[]> {
    const db = getDrizzle();
    const rows = await db
      .select({ task: tasks })
      .from(noteTaskLinks)
      .innerJoin(tasks, eq(tasks.id, noteTaskLinks.taskId))
      .where(and(eq(noteTaskLinks.noteId, noteId), isNull(tasks.deletedAt)));
    return rows.map((r) => r.task as Task);
  },

  /** Notes linked to a task (excludes soft-deleted notes). */
  async listForTask(taskId: string): Promise<readonly Note[]> {
    const db = getDrizzle();
    const rows = await db
      .select({ note: notes })
      .from(noteTaskLinks)
      .innerJoin(notes, eq(notes.id, noteTaskLinks.noteId))
      .where(and(eq(noteTaskLinks.taskId, taskId), isNull(notes.deletedAt)));
    return rows.map((r) => r.note as Note);
  },
} as const;
