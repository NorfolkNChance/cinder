/**
 * File import utilities for the Notes section.
 *
 * Supported formats:
 *   .md / .markdown  → read as-is; title from first `# heading` or filename.
 *                      bodyType: 'markdown'.
 *   .html / .htm     → stored as raw HTML without conversion. bodyType: 'html'.
 *                      Title extracted from <title> or first <h1>.
 *                      Displayed in a sandboxed iframe; edited in a textarea.
 *
 * All file reading uses the standard browser File API (`file.text()`) —
 * safe inside a sandboxed Electron renderer with no Node access required.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ImportedNote {
  title: string;
  body: string;
  bodyType: 'markdown' | 'html';
}

export type ImportFileError =
  | { kind: 'unsupported'; filename: string }
  | { kind: 'read-error'; filename: string; message: string };

export type ImportResult =
  | { ok: true; note: ImportedNote }
  | { ok: false; error: ImportFileError };

// ── Public API ───────────────────────────────────────────────────────────────

/** File extensions this module accepts (lowercase, with dot). */
export const SUPPORTED_EXTENSIONS = ['.md', '.markdown', '.html', '.htm'] as const;

/**
 * Returns true when `file` has a supported extension.
 * Use this in `dragover` to decide whether to accept the drop.
 */
export function isSupportedFile(file: File): boolean {
  const ext = extOf(file.name);
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Import a single `File` object as a note.
 *
 * Reads the file content with the Web File API (no Node required), converts
 * HTML to Markdown if needed, extracts a title, and returns `{ title, body }`.
 */
export async function importFile(file: File): Promise<ImportResult> {
  const ext = extOf(file.name);

  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, error: { kind: 'unsupported', filename: file.name } };
  }

  let rawContent: string;
  try {
    rawContent = await file.text();
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: 'read-error',
        filename: file.name,
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (ext === '.md' || ext === '.markdown') {
    return { ok: true, note: importMarkdown(file.name, rawContent) };
  }

  // .html / .htm
  return { ok: true, note: importHtml(file.name, rawContent) };
}

/**
 * Import all files from a DragEvent's dataTransfer, skipping unsupported
 * types. Returns results in the same order as the input files.
 */
export async function importDroppedFiles(
  dataTransfer: DataTransfer,
): Promise<ImportResult[]> {
  const files = Array.from(dataTransfer.files).filter(isSupportedFile);
  return Promise.all(files.map(importFile));
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function extOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

function stemOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? filename : filename.slice(0, dot);
}

/** Import a Markdown file. Title = first `# heading` or filename stem. */
function importMarkdown(filename: string, content: string): ImportedNote {
  const lines = content.split('\n');
  let title = stemOf(filename);
  let bodyStart = 0;

  // Walk past leading blank lines to find the first heading.
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trimEnd();
    if (line.startsWith('# ')) {
      title = line.slice(2).trim();
      bodyStart = i + 1;
      break;
    }
    // If first non-empty line is NOT a heading, use filename as title
    // and include all content in body.
    if (line.length > 0) break;
  }

  const body = lines.slice(bodyStart).join('\n').trimStart();
  return { title, body, bodyType: 'markdown' };
}

/**
 * Import an HTML file: store the raw HTML as-is. bodyType 'html' tells the
 * editor to display it in a sandboxed iframe and let the user edit the source
 * directly, rather than converting to Markdown.
 */
function importHtml(filename: string, rawHtml: string): ImportedNote {
  // DOMParser is available in sandboxed Electron renderers.
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');

  // Title priority: <title>, first <h1>, filename stem.
  const title =
    doc.querySelector('title')?.textContent?.trim() ||
    doc.querySelector('h1')?.textContent?.trim() ||
    stemOf(filename);

  return { title, body: rawHtml, bodyType: 'html' };
}
