import { v7 as uuidv7 } from 'uuid';
import { app } from 'electron';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { resolveAttachmentPath } from '../security/attachment-path';

/**
 * Attachment storage service.
 *
 * Writes user-supplied bytes to `userData/attachments/<noteId>/<filename>`
 * after the path validator has cleared the inputs.
 *
 * Filename strategy: callers never supply the on-disk filename directly.
 * The service generates a fresh `<uuidv7>.<sanitised-ext>` so:
 *   1. Collisions inside a note's folder are impossible without
 *      cooperating actors,
 *   2. Pathological original filenames (control chars, oversized,
 *      separators) can't influence what touches the filesystem,
 *   3. Garbage collection on note delete (future work) only needs to
 *      `rm -rf` the note's folder — no original-name database to query.
 */

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

/**
 * Pick a safe on-disk extension. Prefers the MIME type (authoritative)
 * over the original filename (user-controlled). Falls back to `'bin'`
 * for unknown types — the file is still served, just without a hint.
 */
function pickExtension(
  originalFilename: string | undefined,
  mimeType: string | undefined,
): string {
  if (mimeType !== undefined && mimeType in MIME_TO_EXT) {
    return MIME_TO_EXT[mimeType]!;
  }
  if (originalFilename !== undefined) {
    const dot = originalFilename.lastIndexOf('.');
    if (dot > 0 && dot < originalFilename.length - 1) {
      const ext = originalFilename
        .slice(dot + 1)
        .toLowerCase()
        // Restrict to alphanumerics — nothing exotic ever needs to land
        // in our filenames since the validator forbids separators anyway.
        .replace(/[^a-z0-9]/g, '');
      if (ext.length > 0 && ext.length <= 10) return ext;
    }
  }
  return 'bin';
}

export interface SavedAttachment {
  /** The attachment:// URL the renderer should embed in the markdown. */
  readonly url: string;
  /** The on-disk filename (UUIDv7 + extension). */
  readonly filename: string;
}

interface SaveAttachmentInput {
  readonly noteId: string;
  readonly data: Uint8Array;
  // `?: string | undefined` is required (rather than just `?: string`) because
  // `exactOptionalPropertyTypes: true` makes the two non-equivalent: Zod
  // returns objects where omitted optionals show up as `undefined` keys.
  readonly originalFilename?: string | undefined;
  readonly mimeType?: string | undefined;
}

/**
 * Persist a single attachment for a note and return its URL. The
 * filename is generated server-side — see module doc for the rationale.
 */
export function saveAttachment(input: SaveAttachmentInput): SavedAttachment {
  const ext = pickExtension(input.originalFilename, input.mimeType);
  const filename = `${uuidv7()}.${ext}`;

  // Ensure the per-note directory exists. mkdir is idempotent with
  // `recursive: true`; we also create the parent attachments/ root
  // since it doesn't exist on a fresh install.
  const attachmentsRoot = join(app.getPath('userData'), 'attachments');
  const noteDir = join(attachmentsRoot, input.noteId);
  mkdirSync(noteDir, { recursive: true });

  // Validate the path AFTER mkdir (so realpath resolution works even
  // when the dir was just created), then write the bytes.
  const absolutePath = resolveAttachmentPath(input.noteId, filename);
  writeFileSync(absolutePath, input.data, { mode: 0o600 });

  return {
    url: `attachment://${input.noteId}/${filename}`,
    filename,
  };
}

/**
 * Remove a note's entire attachment directory. Called when a note is
 * hard-deleted (from the Trash view or the purge job) — this is the
 * "garbage collection on note delete" the filename strategy above was
 * designed for.
 *
 * The noteId is re-validated as a UUID before it is joined into an
 * `rm -rf` path: every caller receives it through a Zod NoteId schema
 * already, but a recursive delete warrants its own guard rather than an
 * assumption about upstream validation.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function deleteAttachmentsDir(noteId: string): void {
  if (!UUID_RE.test(noteId)) {
    throw new Error(`deleteAttachmentsDir: invalid note id ${noteId}`);
  }
  const dir = join(app.getPath('userData'), 'attachments', noteId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
