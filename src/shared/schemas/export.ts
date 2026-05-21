import { z } from 'zod';

/**
 * Zod schemas for the export domain.
 *
 * All export handlers open a native Save/Open dialog in the main process —
 * the renderer never receives or supplies a raw file path. The schemas here
 * carry only the logical parameters needed to build the file content.
 */

const Uuid = z.string().uuid();

// ── Inputs ───────────────────────────────────────────────────────────────────

/** Export a single note. Main fetches the body from the DB and shows a Save dialog. */
export const ExportNoteInput = z.object({
  noteId: Uuid,
});
export type ExportNoteInput = z.infer<typeof ExportNoteInput>;

/**
 * Export all notes. Main lists all non-deleted notes and shows an
 * Open-directory dialog to pick the destination folder.
 */
export const ExportAllNotesInput = z.object({});
export type ExportAllNotesInput = z.infer<typeof ExportAllNotesInput>;

/**
 * Export tasks as CSV. Optional filters narrow the export to a specific
 * scope (project, label, or all active tasks when nothing is provided).
 */
export const ExportTasksInput = z.object({
  /** When provided, only tasks in this project are exported. */
  projectId: Uuid.optional(),
  /** When provided, only tasks with this label are exported. */
  labelId: Uuid.optional(),
  /** Include completed tasks (default: false). */
  includeCompleted: z.boolean().optional(),
});
export type ExportTasksInput = z.infer<typeof ExportTasksInput>;

/** Full encrypted DB backup — no parameters, just show a Save dialog. */
export const ExportBackupInput = z.object({});
export type ExportBackupInput = z.infer<typeof ExportBackupInput>;

// ── Results ──────────────────────────────────────────────────────────────────

/**
 * Returned by every export handler.
 *
 *   success: true  → export completed; `path` is where the file was saved
 *   success: false → export did not complete; `reason` explains why
 *     'cancelled'  → user closed the dialog without picking a location
 *     'error'      → an I/O or data error occurred; `message` has details
 */
export const ExportResult = z.discriminatedUnion('success', [
  z.object({ success: z.literal(true), path: z.string() }),
  z.object({
    success: z.literal(false),
    reason: z.enum(['cancelled', 'error']),
    message: z.string().optional(),
  }),
]);
export type ExportResult = z.infer<typeof ExportResult>;
