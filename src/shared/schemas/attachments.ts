import { z } from 'zod';

/**
 * Attachment IPC schemas.
 *
 * The renderer hands the main process a Uint8Array of raw bytes plus an
 * optional original filename and MIME type. The service generates the
 * on-disk filename — see services/attachments.ts. Returns the
 * `attachment://` URL the renderer should embed in markdown.
 */

const NoteId = z.string().uuid();

// Cap raw payload at 25 MiB. This is well above what a paste from the
// clipboard typically produces (single-image, often < 5 MiB) but caps
// pathological inputs from a compromised renderer (§3 — every IPC entry
// point is a public API).
const MAX_BYTES = 25 * 1024 * 1024;

export const AttachmentSaveInput = z.object({
  noteId: NoteId,
  data: z
    .instanceof(Uint8Array)
    .refine((u) => u.byteLength > 0, { message: 'data is empty' })
    .refine((u) => u.byteLength <= MAX_BYTES, {
      message: `data exceeds ${MAX_BYTES} bytes`,
    }),
  // User-supplied; the service treats these as hints only — never trusted
  // for filesystem decisions. See services/attachments.ts pickExtension().
  originalFilename: z.string().max(255).optional(),
  mimeType: z.string().max(127).optional(),
});
export type AttachmentSaveInput = z.infer<typeof AttachmentSaveInput>;

export const AttachmentSaveResult = z.object({
  url: z.string().startsWith('attachment://'),
  filename: z.string(),
});
export type AttachmentSaveResult = z.infer<typeof AttachmentSaveResult>;
