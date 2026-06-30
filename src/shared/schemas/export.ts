import { z } from 'zod';

/**
 * Zod schemas for the export domain.
 *
 * All export handlers open a native Save/Open dialog in the main process —
 * the renderer never receives or supplies a raw file path. The schemas here
 * carry only the logical parameters needed to build the file content.
 */

const Uuid = z.string().uuid();

/**
 * Output format for note exports.
 *   'md'   → portable Markdown (default; images inlined as data: URIs)
 *   'docx' → Word document, built from the Markdown via the `docx` library
 *   'pdf'  → PDF, rendered Markdown→HTML and printed in an offscreen window
 *
 * Only notes support docx/pdf — tasks (CSV) and the DB backup do not.
 */
export const ExportFormat = z.enum(['md', 'docx', 'pdf']);
export type ExportFormat = z.infer<typeof ExportFormat>;

// ── Inputs ───────────────────────────────────────────────────────────────────

/** Export a single note. Main fetches the body from the DB and shows a Save dialog. */
export const ExportNoteInput = z.object({
  noteId: Uuid,
  /**
   * Optional renderer-resolved body to export instead of the stored body. The
   * renderer uses this to inline live `drawing://` embeds (which only it can
   * rasterize) as `data:` URIs before export. Main still inlines `attachment://`
   * images on top. Bounded generously — inlined images can be large.
   */
  body: z.string().max(64_000_000).optional(),
  /** Output format. Defaults to 'md' in the service when omitted. */
  format: ExportFormat.optional(),
});
export type ExportNoteInput = z.infer<typeof ExportNoteInput>;

/**
 * Export all notes. Main lists all non-deleted notes and shows an
 * Open-directory dialog to pick the destination folder.
 */
export const ExportAllNotesInput = z.object({
  /** Output format for every exported file. Defaults to 'md' when omitted. */
  format: ExportFormat.optional(),
});
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

/**
 * Export the database encryption key to a text file.
 * No parameters — opens a Save dialog in the main process.
 * The renderer never receives the raw key value.
 */
export const ExportKeyBackupInput = z.object({});
export type ExportKeyBackupInput = z.infer<typeof ExportKeyBackupInput>;

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
