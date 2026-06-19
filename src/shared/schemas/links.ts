import { z } from 'zod';

/**
 * Zod schemas for the note ↔ task links domain.
 *
 * A link is the pair (noteId, taskId). The same conventions as the other
 * domains apply: every IPC payload is validated at the handler boundary
 * (§3.4). See schema.ts `note_task_links` for the persistence shape.
 */

const NoteId = z.string().uuid();
const TaskId = z.string().uuid();

export const LinkCreateInput = z.object({
  noteId: NoteId,
  taskId: TaskId,
});
export type LinkCreateInput = z.infer<typeof LinkCreateInput>;

export const LinkDeleteInput = z.object({
  noteId: NoteId,
  taskId: TaskId,
});
export type LinkDeleteInput = z.infer<typeof LinkDeleteInput>;

/** List the tasks linked to a given note. */
export const LinkListForNoteInput = z.object({
  noteId: NoteId,
});
export type LinkListForNoteInput = z.infer<typeof LinkListForNoteInput>;

/** List the notes linked to a given task. */
export const LinkListForTaskInput = z.object({
  taskId: TaskId,
});
export type LinkListForTaskInput = z.infer<typeof LinkListForTaskInput>;
