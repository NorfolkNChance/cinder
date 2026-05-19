import { net, protocol } from 'electron';
import { pathToFileURL } from 'url';
import { resolveAttachmentPath, AttachmentPathError } from '../security/attachment-path';

/**
 * Custom `attachment://` protocol.
 *
 * Per ARCHITECTURE.md §6.1, note attachments live on disk at
 * `userData/attachments/<note-id>/<filename>` and are referenced from
 * markdown bodies as `attachment://<note-id>/<filename>`. This module
 * registers the scheme as privileged (must run before app.whenReady)
 * and registers the handler that serves files from the validated
 * filesystem location (must run after app.whenReady).
 *
 * URL shape:
 *   attachment://<note-id>/<filename>
 *
 * The note-id is parsed from the URL hostname and the filename from the
 * pathname. Both are passed to validateAttachmentPath which enforces
 * UUID format, separator-free filename, and (via realpath) no symlink
 * escape from the attachments root. Any rejection becomes a 403; any
 * unexpected error becomes a 500. ENOENT becomes a 404.
 */

/**
 * Register the `attachment` scheme as standard/secure/fetch-capable.
 * MUST be called before `app.whenReady()` — Electron rejects late changes
 * to the privileged-schemes list.
 *
 *   - `standard: true`     — gives the scheme an origin so CSP `'self'`
 *                             interactions and same-origin rules work
 *   - `secure: true`       — treated as HTTPS-equivalent (no mixed-content
 *                             warnings, eligible for service workers, etc.)
 *   - `supportFetchAPI`    — renderer-side `fetch('attachment://...')` works
 *   - `corsEnabled: true`  — required by the renderer's <img> loader for
 *                             cross-origin scheme handling
 */
export function registerAttachmentSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'attachment',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

/**
 * Register the actual file-serving handler. Call from `app.whenReady()`.
 *
 * Uses Electron's modern `protocol.handle()` API (replaces the deprecated
 * `protocol.registerFileProtocol`). `net.fetch` does the actual file read
 * — it handles range requests, content-type sniffing, and stream
 * backpressure automatically.
 */
export function registerAttachmentProtocol(): void {
  protocol.handle('attachment', async (request) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return new Response('Invalid attachment URL', { status: 400 });
    }

    // hostname = noteId; pathname = '/filename' (URL-decoded by URL parser).
    const noteId = url.hostname;
    const filename = decodeURIComponent(url.pathname.replace(/^\//, ''));

    let absolutePath: string;
    try {
      absolutePath = resolveAttachmentPath(noteId, filename);
    } catch (err) {
      if (err instanceof AttachmentPathError) {
        return new Response(err.message, { status: 403 });
      }
      // Re-throw anything we didn't expect — better to surface than swallow.
      throw err;
    }

    // Delegate the actual byte transfer to net.fetch via a file:// URL.
    // It will return 404 if the file doesn't exist.
    return net.fetch(pathToFileURL(absolutePath).toString());
  });
}
