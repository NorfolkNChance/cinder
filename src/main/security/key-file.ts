/**
 * Parsing for exported encryption-key files.
 *
 * `exportKeyBackup()` (services/export.ts) writes a human-readable text
 * file containing a `Key: <64 hex chars>` line. The restore and key-import
 * flows read that file back. Parsing lives in its own module so both the
 * DB boot path and the restore service can share it without a dependency
 * cycle, and so it can be unit-tested as a pure function.
 *
 * The raw key never touches the renderer in either direction: the file is
 * chosen via a native dialog and read in the main process.
 */

/** SQLCipher raw keys are exactly 32 bytes = 64 hex characters. */
const KEY_LINE_RE = /Key:\s*([0-9a-fA-F]{64})\b/;
const BARE_KEY_RE = /^[0-9a-fA-F]{64}$/;

/**
 * Extract the encryption key from an exported key file's content.
 *
 * Accepts either the full exported file format (`Key: <hex>` line anywhere
 * in the text) or a file containing just the 64 hex characters — so a key
 * pasted into a fresh file, e.g. out of a password manager, works too.
 *
 * Returns the key lower-cased, or null if no plausible key is present.
 */
export function parseKeyFileContent(content: string): string | null {
  const lineMatch = KEY_LINE_RE.exec(content);
  if (lineMatch?.[1] !== undefined) return lineMatch[1].toLowerCase();

  const trimmed = content.trim();
  if (BARE_KEY_RE.test(trimmed)) return trimmed.toLowerCase();

  return null;
}
