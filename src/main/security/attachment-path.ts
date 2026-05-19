import { resolve, sep } from 'path';
import { realpathSync } from 'fs';
import { app } from 'electron';

/**
 * Path validation for the attachment:// protocol.
 *
 * Per ARCHITECTURE.md §6.1: attachments live under
 * `app.getPath('userData')/attachments/<note-id>/<filename>` and the
 * protocol handler "validates the path is inside the attachments root
 * (no `../` traversal, no symlink escape)".
 *
 * This module enforces both checks. The pure `validateAttachmentPath`
 * function takes the root as a parameter so it can be unit-tested without
 * standing up the full Electron environment. `resolveAttachmentPath` is
 * the thin runtime wrapper that supplies the real userData root.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class AttachmentPathError extends Error {
  constructor(reason: string) {
    super(`Attachment path rejected: ${reason}`);
    this.name = 'AttachmentPathError';
  }
}

/**
 * Validate and resolve an attachment path against an explicit root.
 *
 * @param root        absolute path to the attachments root (parent of all note dirs)
 * @param noteId      UUID — used as the per-note subdirectory name
 * @param filename    leaf filename — must not contain path separators
 * @returns           absolute path inside the root, safe to read/write
 * @throws AttachmentPathError on any rejection (caller treats as 4xx-equivalent)
 */
export function validateAttachmentPath(
  root: string,
  noteId: string,
  filename: string,
): string {
  // 1. Syntactic checks on the inputs themselves. Doing these up front
  //    keeps the more expensive filesystem-touching checks below from
  //    receiving anything pathological.
  if (!UUID_RE.test(noteId)) {
    throw new AttachmentPathError('note id is not a UUID');
  }
  if (filename.length === 0) {
    throw new AttachmentPathError('filename is empty');
  }
  if (filename.length > 255) {
    // Most filesystems cap at 255 bytes per path component.
    throw new AttachmentPathError('filename exceeds 255 chars');
  }
  if (
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('\0')
  ) {
    throw new AttachmentPathError('filename contains path separator or NUL');
  }
  if (filename === '.' || filename === '..') {
    throw new AttachmentPathError('filename is a directory reference');
  }

  // 2. Resolve the candidate path and require it to live under the root.
  //    `path.resolve` canonicalises `.` / `..` segments — even though we
  //    rejected literal '.'/'..' above, this still defends against any
  //    weirdness in noteId (which we've already verified is a UUID, but
  //    cheap to keep the second line of defence).
  //
  //    The root itself may sit under a symlinked parent (on macOS the
  //    user's temp dir and home dir often live under /private/... that
  //    /var/... and /tmp/... symlink to). We canonicalise both sides so
  //    the prefix comparison is apples-to-apples; otherwise legitimate
  //    files would be rejected by virtue of the OS layout alone.
  let canonicalRoot: string;
  try {
    canonicalRoot = realpathSync(resolve(root));
  } catch {
    canonicalRoot = resolve(root);
  }
  const prefix = canonicalRoot + sep;
  const candidate = resolve(canonicalRoot, noteId, filename);

  if (!candidate.startsWith(prefix)) {
    throw new AttachmentPathError('candidate path escapes attachments root');
  }

  // 3. If the file already exists, follow symlinks and re-check the prefix.
  //    On a write path the file may not exist yet — that's fine; the
  //    realpath check is only meaningful when there's something to follow.
  let realCandidate: string;
  try {
    realCandidate = realpathSync(candidate);
  } catch {
    // ENOENT (or any other readlink failure) — the file isn't there.
    // For new-write paths this is the common case. The candidate prefix
    // check above is the only guarantee available.
    return candidate;
  }

  if (!realCandidate.startsWith(prefix)) {
    throw new AttachmentPathError(
      'symlink target escapes attachments root',
    );
  }

  return candidate;
}

/**
 * Resolve an attachment path against the runtime userData directory.
 * Convenience wrapper around `validateAttachmentPath`.
 */
export function resolveAttachmentPath(
  noteId: string,
  filename: string,
): string {
  const root = `${app.getPath('userData')}${sep}attachments`;
  return validateAttachmentPath(root, noteId, filename);
}
