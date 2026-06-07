/**
 * Vault importer.
 *
 * Executes a confirmed VaultImportPlan: reads note files from disk, transforms
 * their content according to the chosen options, and writes them to the Cinder
 * database via notesService. Pushes VaultProgress events to the renderer after
 * each batch so the UI can show a live progress bar.
 *
 * This module intentionally has no UI dependency — it is pure main-process code.
 */

import { readFile } from 'fs/promises';
import { readFileSync, realpathSync } from 'fs';
import path from 'path';
import type { WebContents } from 'electron';
import { notesService } from './notes';
import { extractTitle, stripFrontmatter } from './vaultScanner';
import { saveAttachment } from './attachments';
import type { VaultImportPlan, VaultImportResult, VaultProgress } from '../../shared/schemas/vault';
import { VAULT_PROGRESS } from '../../shared/ipc/channels';

// ── Path containment ─────────────────────────────────────────────────────────

/**
 * Resolve `relativePath` against `vaultRoot` and assert the result stays
 * inside the vault. Throws if a `../` traversal would escape the root.
 *
 * `relativePath` values come from the renderer via VaultImportPlan and must
 * be validated before being used to read files — the same defence-in-depth
 * pattern applied in `security/attachment-path.ts`.
 */
export function safeVaultPath(vaultRoot: string, relativePath: string): string {
  // Canonicalise the root itself — on macOS userData and tmp dirs are often
  // reached via /private/... symlinks, so we must compare like with like.
  let canonicalRoot: string;
  try {
    canonicalRoot = realpathSync(path.resolve(vaultRoot));
  } catch {
    canonicalRoot = path.resolve(vaultRoot);
  }
  const prefix = canonicalRoot + path.sep;

  // Syntactic traversal check. Resolve against both the original vaultRoot (to
  // produce the return value callers expect) and canonicalRoot (for the prefix
  // comparison — apples-to-apples on macOS where /tmp → /private/tmp).
  const candidate = path.resolve(vaultRoot, relativePath);
  const candidateCanonical = path.resolve(canonicalRoot, relativePath);
  if (!candidateCanonical.startsWith(prefix)) {
    throw new Error(
      `Path traversal detected: "${relativePath}" escapes vault root`,
    );
  }

  // Symlink check: if the file already exists, follow all symlinks and
  // re-validate. A symlink inside the vault (e.g. link → /etc) passes the
  // syntactic check above but the realpath escapes the vault root.
  try {
    const real = realpathSync(candidate);
    if (!real.startsWith(prefix)) {
      throw new Error(
        `Path traversal detected: "${relativePath}" escapes vault root via symlink`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('escapes vault root')) {
      throw err;
    }
    // ENOENT — file doesn't exist yet; syntactic check is the only guarantee.
  }

  return candidate;
}

// ── Content transformations ───────────────────────────────────────────────────

/**
 * Convert [[wiki links]] to plain text according to the chosen strategy.
 *   [[Note Name]]              → "Note Name"
 *   [[Note Name|Display Text]] → "Display Text"
 */
export function applyWikiLinks(
  body: string,
  strategy: 'plain-text' | 'leave-as-is',
): string {
  if (strategy === 'leave-as-is') return body;
  return body.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match, target: string, display?: string) =>
      (display ?? target).trim(),
  );
}

/**
 * Build the note title with an optional folder prefix.
 *   'none'      → "Meeting notes"
 *   'top-level' → "Projects / Meeting notes"
 *   'full-path' → "Projects/Work / Meeting notes"
 */
export function buildTitle(
  rawTitle: string,
  relativePath: string,
  strategy: 'top-level' | 'full-path' | 'none',
): string {
  if (strategy === 'none') return rawTitle;

  // Strip filename from path to get the folder portion.
  const dir = path.dirname(relativePath).replace(/\\/g, '/');
  if (!dir || dir === '.') return rawTitle;

  const parts = dir.split('/');
  const prefix =
    strategy === 'top-level'
      ? (parts[0] ?? '')
      : parts.join('/');

  return prefix ? `${prefix} / ${rawTitle}` : rawTitle;
}

/**
 * Convert Obsidian ![[embed]] syntax to Markdown image links using
 * attachment:// URLs. For each embed reference found in the body, the
 * matching vault file is copied to Cinder's attachment storage.
 *
 * Unrecognised filenames (no matching attachment) are left as-is so the
 * user can investigate after import.
 */
function processEmbeds(
  body: string,
  noteId: string,
  vaultPath: string,
  attachmentRelativePaths: string[],
): string {
  if (attachmentRelativePaths.length === 0) return body;

  // Build a case-insensitive map: lowercase filename → absolute vault path.
  // Use safeVaultPath so that a malicious VaultImportPlan cannot escape the
  // vault root via traversal sequences or symlinks in attachmentRelativePaths.
  const filenameMap = new Map<string, string>();
  for (const relPath of attachmentRelativePaths) {
    try {
      const filename = path.basename(relPath);
      filenameMap.set(filename.toLowerCase(), safeVaultPath(vaultPath, relPath));
    } catch {
      // Skip paths that escape the vault root — they should never appear in a
      // legitimate scan result but could be injected via a crafted IPC call.
    }
  }

  // Match ![[filename]] and ![[filename|alt text]] syntax.
  return body.replace(
    /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match: string, target: string, alt?: string) => {
      const normalized = target.trim().toLowerCase();
      const vaultAbsolute = filenameMap.get(normalized);
      if (!vaultAbsolute) return _match;

      try {
        const data = readFileSync(vaultAbsolute);
        const result = saveAttachment({
          noteId,
          data,
          originalFilename: target.trim(),
        });
        const altText = alt?.trim() ?? target.trim();
        return `![${altText}](${result.url})`;
      } catch {
        return _match;
      }
    },
  );
}

// ── Progress helper ───────────────────────────────────────────────────────────

function push(sender: WebContents, progress: VaultProgress): void {
  if (!sender.isDestroyed()) {
    sender.send(VAULT_PROGRESS, progress);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Execute the import plan. Reads each file from disk, applies content
 * transformations, and creates notes in the database. Fires VaultProgress
 * push events during execution so the renderer can show live progress.
 *
 * @param plan    - The confirmed import plan from the preview modal.
 * @param sender  - The renderer WebContents to push progress events to.
 */
export async function importVault(
  plan: VaultImportPlan,
  sender: WebContents,
): Promise<VaultImportResult> {
  const { vaultPath, noteRelativePaths, dailyNoteRelativePaths, attachmentRelativePaths, options } = plan;
  const errors: string[] = [];
  let notesCreated = 0;
  let dailyNotesCreated = 0;
  let notesUpdated = 0;

  // ── Import regular notes ─────────────────────────────────────────────────

  push(sender, {
    phase: 'notes',
    current: 0,
    total: noteRelativePaths.length,
  });

  for (let i = 0; i < noteRelativePaths.length; i++) {
    const relativePath = noteRelativePaths[i];
    if (!relativePath) continue;

    try {
      const absolutePath = safeVaultPath(vaultPath, relativePath);
      const raw = await readFile(absolutePath, 'utf-8');

      const rawTitle = extractTitle(raw, path.basename(relativePath, '.md'));
      const rawBody = stripFrontmatter(raw);

      let title = buildTitle(rawTitle, relativePath, options.folderPrefix);
      let body = applyWikiLinks(rawBody, options.wikiLinks);

      // Check whether this note already exists (by title).
      const existingNotes = await notesService.list({ includeDeleted: false });
      const match = (existingNotes as readonly { id: string; title: string }[]).find(
        (n) => n.title === title,
      );

      if (match && options.resyncStrategy === 'create-only') {
        push(sender, {
          phase: 'notes',
          current: i + 1,
          total: noteRelativePaths.length,
        });
        continue;
      }

      if (match && options.resyncStrategy === 'overwrite') {
        if (options.importAttachments) {
          body = processEmbeds(body, match.id, vaultPath, attachmentRelativePaths);
        }
        await notesService.update({ id: match.id, patch: { body } });
        notesUpdated++;
      } else {
        const note = await notesService.create({ title, body, bodyType: 'markdown' });

        if (options.importAttachments) {
          const processedBody = processEmbeds(body, note.id, vaultPath, attachmentRelativePaths);
          if (processedBody !== body) {
            await notesService.update({ id: note.id, patch: { body: processedBody } });
          }
        }

        notesCreated++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${relativePath}: ${msg}`);
    }

    // Push progress every item (debounced by renderer if needed).
    push(sender, {
      phase: 'notes',
      current: i + 1,
      total: noteRelativePaths.length,
    });
  }

  // ── Import daily notes ────────────────────────────────────────────────────

  push(sender, {
    phase: 'daily-notes',
    current: 0,
    total: dailyNoteRelativePaths.length,
  });

  for (let i = 0; i < dailyNoteRelativePaths.length; i++) {
    const relativePath = dailyNoteRelativePaths[i];
    if (!relativePath) continue;

    // Extract date from the relative path.
    // The scanner already verified the date is parseable; re-extract here.
    const dateMatch = relativePath.match(/(\d{4}-\d{2}-\d{2})/);
    // Also try the YYYY/MM/DD pattern.
    const dirParts = path.dirname(relativePath).replace(/\\/g, '/').split('/');
    const stem = path.basename(relativePath, '.md');

    let date: string | null = null;

    // Try YYYY-MM-DD in filename first.
    if (/^\d{4}-\d{2}-\d{2}$/.test(stem)) {
      date = stem;
    } else if (dateMatch?.[1]) {
      date = dateMatch[1];
    } else {
      // Reconstruct from YYYY/MM/DD folder parts.
      const numericParts = dirParts.filter((p) => /^\d+$/.test(p));
      if (numericParts.length >= 3) {
        const [yr, mo, dy] = numericParts.slice(-3);
        if (yr && mo && dy) {
          date = `${yr}-${mo.padStart(2, '0')}-${dy.padStart(2, '0')}`;
        }
      } else if (numericParts.length >= 2 && /^\d{1,2}$/.test(stem)) {
        const [yr, mo] = numericParts.slice(-2);
        if (yr && mo) {
          date = `${yr}-${mo.padStart(2, '0')}-${stem.padStart(2, '0')}`;
        }
      }
    }

    if (!date) {
      errors.push(`${relativePath}: Could not determine date.`);
      push(sender, {
        phase: 'daily-notes',
        current: i + 1,
        total: dailyNoteRelativePaths.length,
      });
      continue;
    }

    try {
      const absolutePath = safeVaultPath(vaultPath, relativePath);
      const raw = await readFile(absolutePath, 'utf-8');
      const rawBody = stripFrontmatter(raw);
      let body = applyWikiLinks(rawBody, options.wikiLinks);

      // getOrCreateDaily is idempotent — if a note for this date already
      // exists, it returns it instead of creating a duplicate.
      const existing = await notesService.getOrCreateDaily({ date });

      if (options.importAttachments) {
        body = processEmbeds(body, existing.id, vaultPath, attachmentRelativePaths);
      }

      if (body.trim() === '') {
        // Skip — nothing to write.
      } else if (existing.body.trim() === '' || options.resyncStrategy === 'overwrite') {
        // Fill empty body or overwrite existing content in re-sync mode.
        await notesService.update({ id: existing.id, patch: { body } });
        dailyNotesCreated++;
      } else {
        // Exists with content and we're not overwriting — count as "already present".
        notesUpdated++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${relativePath}: ${msg}`);
    }

    push(sender, {
      phase: 'daily-notes',
      current: i + 1,
      total: dailyNoteRelativePaths.length,
    });
  }

  // ── Done ─────────────────────────────────────────────────────────────────

  push(sender, {
    phase: 'done',
    current: notesCreated + dailyNotesCreated,
    total: noteRelativePaths.length + dailyNoteRelativePaths.length,
  });

  return { notesCreated, dailyNotesCreated, notesUpdated, errors };
}
