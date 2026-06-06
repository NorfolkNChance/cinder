/**
 * Vault scanner.
 *
 * Reads an Obsidian vault from disk and returns a VaultScanResult containing
 * metadata for every importable item. No database writes happen here.
 *
 * The scanner handles three categories of file:
 *   - Regular notes (.md outside the daily notes folder)
 *   - Daily notes (.md inside the daily notes folder whose path encodes a date)
 *   - Skipped (non-.md files, .obsidian config, system files)
 *
 * Daily note date detection supports the common Obsidian layouts:
 *   Daily Notes/YYYY/MM/DD.md        ← the "year/month/day" nested layout
 *   Daily Notes/YYYY/MM/YYYY-MM-DD.md
 *   Daily Notes/YYYY/YYYY-MM-DD.md
 *   Daily Notes/YYYY-MM-DD.md        ← flat layout
 */

import { readdir, readFile, stat as statFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { and, isNull, isNotNull } from 'drizzle-orm';
import { getDrizzle } from '../db/drizzle';
import { notes } from '../db/schema';
import type {
  VaultScanInput,
  VaultScanResult,
  ScannedNote,
  ScannedDailyNote,
  SkippedFile,
  ImportItemStatus,
} from '../../shared/schemas/vault';

// ── Directory walker ──────────────────────────────────────────────────────────

interface FileEntry {
  absolutePath: string;
  relativePath: string; // relative to vault root, using forward slashes
}

/**
 * Recursively collect all files under `dir`.
 * Skips `.obsidian`, `.DS_Store`, hidden directories, and `node_modules`.
 */
async function walkDirectory(dir: string, vaultRoot: string): Promise<FileEntry[]> {
  const results: FileEntry[] = [];

  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return results; // directory unreadable — skip silently
  }

  for (const name of names) {
    // Skip hidden entries and noise directories.
    if (name.startsWith('.') || name === 'node_modules') continue;

    const absolutePath = path.join(dir, name);
    const relativePath = path
      .relative(vaultRoot, absolutePath)
      .replace(/\\/g, '/'); // normalise to forward slashes on Windows

    let entryStat;
    try {
      entryStat = await statFile(absolutePath);
    } catch {
      continue; // unreadable — skip
    }

    if (entryStat.isDirectory()) {
      const sub = await walkDirectory(absolutePath, vaultRoot);
      results.push(...sub);
    } else if (entryStat.isFile()) {
      results.push({ absolutePath, relativePath });
    }
  }

  return results;
}

// ── Daily note date detection ─────────────────────────────────────────────────

/**
 * Given a path relative to the daily notes root (e.g. "2026/05/29.md"),
 * try to extract a YYYY-MM-DD date string. Returns null if no date is found.
 *
 * Patterns tried (in order):
 *   1. Filename is YYYY-MM-DD.md                  → plain filename date
 *   2. YYYY/MM/DD.md                              → nested folder structure
 *   3. YYYY/MM/YYYY-MM-DD.md                      → year+month folder, date filename
 *   4. YYYY/YYYY-MM-DD.md                         → year folder, date filename
 */
export function tryParseDailyDate(relativeToRoot: string): string | null {
  const normalised = relativeToRoot.replace(/\\/g, '/');
  // Strip .md extension.
  const withoutExt = normalised.endsWith('.md')
    ? normalised.slice(0, -3)
    : normalised;

  const parts = withoutExt.split('/');
  const filename = parts[parts.length - 1] ?? '';

  // Pattern 1 & 3 & 4: filename is a date string.
  if (/^\d{4}-\d{2}-\d{2}$/.test(filename)) {
    return isValidDate(filename) ? filename : null;
  }

  // Pattern 2: YYYY/MM/DD — three path segments where all are numeric.
  if (parts.length >= 3) {
    const [yr, mo, dy] = parts.slice(-3);
    if (
      yr && /^\d{4}$/.test(yr) &&
      mo && /^\d{2}$/.test(mo) &&
      dy && /^\d{2}$/.test(dy)
    ) {
      const candidate = `${yr}-${mo}-${dy}`;
      return isValidDate(candidate) ? candidate : null;
    }
  }

  // Pattern: YYYY/MM/D (single-digit day without zero-padding).
  if (parts.length >= 3) {
    const [yr, mo, dy] = parts.slice(-3);
    if (
      yr && /^\d{4}$/.test(yr) &&
      mo && /^\d{2}$/.test(mo) &&
      dy && /^\d{1,2}$/.test(dy)
    ) {
      const candidate = `${yr}-${mo}-${dy.padStart(2, '0')}`;
      return isValidDate(candidate) ? candidate : null;
    }
  }

  return null;
}

function isValidDate(dateStr: string): boolean {
  // Parse as noon-local to avoid timezone off-by-one (see CLAUDE.md gotcha).
  const d = new Date(`${dateStr}T12:00:00`);
  return !isNaN(d.getTime());
}

// ── Markdown helpers ──────────────────────────────────────────────────────────

/** Count [[wiki link]] occurrences. */
function countWikiLinks(body: string): number {
  return (body.match(/\[\[[^\]]+\]\]/g) ?? []).length;
}

/** Count ![[embed]] occurrences (images, PDFs, etc.). */
function countEmbeds(body: string): number {
  return (body.match(/!\[\[[^\]]+\]\]/g) ?? []).length;
}

/**
 * Extract the title from markdown content.
 * Priority: YAML frontmatter `title:`, first `# heading`, filename stem.
 */
export function extractTitle(content: string, filenameStem: string): string {
  // 1. YAML frontmatter title.
  if (content.startsWith('---')) {
    const fmEnd = content.indexOf('\n---', 3);
    if (fmEnd !== -1) {
      const fm = content.slice(3, fmEnd);
      const match = fm.match(/^title:\s*(.+)$/m);
      if (match?.[1]) return match[1].trim().replace(/^["']|["']$/g, '');
    }
  }

  // 2. First # heading.
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch?.[1]) return headingMatch[1].trim();

  // 3. Filename stem.
  return filenameStem;
}

/** Strip YAML frontmatter from markdown content. */
function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return content;
  return content.slice(end + 4).trimStart();
}

// Suppress unused import warning — stripFrontmatter is used by the importer.
void stripFrontmatter;

// ── Public API ────────────────────────────────────────────────────────────────

export async function scanVault(input: VaultScanInput): Promise<VaultScanResult> {
  const { vaultPath, dailyNotesFolder, checkExisting } = input;

  if (!existsSync(vaultPath)) {
    return {
      vaultPath,
      notes: [],
      dailyNotes: [],
      attachments: [],
      skipped: [{ relativePath: '.', reason: 'Vault folder not found.' }],
    };
  }

  // If checkExisting, preload existing note titles and daily dates from the DB.
  let existingTitles: Set<string> | undefined;
  let existingDailyDates: Set<string> | undefined;
  if (checkExisting) {
    const db = getDrizzle();
    const rows = await db
      .select({ title: notes.title, dailyDate: notes.dailyDate })
      .from(notes)
      .where(and(isNull(notes.deletedAt), isNull(notes.dailyDate)));
    existingTitles = new Set(rows.map((r) => r.title));

    const dailyRows = await db
      .select({ dailyDate: notes.dailyDate })
      .from(notes)
      .where(and(isNull(notes.deletedAt), isNotNull(notes.dailyDate)));
    existingDailyDates = new Set(dailyRows.map((r) => r.dailyDate).filter((d): d is string => d !== null));
  }

  const allFiles = await walkDirectory(vaultPath, vaultPath);

  const scannedNotes: ScannedNote[] = [];
  const scannedDailyNotes: ScannedDailyNote[] = [];
  const attachments: string[] = [];
  const skipped: SkippedFile[] = [];

  // Normalise the daily notes folder name for prefix matching.
  const dailyRoot = dailyNotesFolder
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/$/, ''); // strip trailing slash

  for (const { absolutePath, relativePath } of allFiles) {
    const ext = path.extname(relativePath).toLowerCase();

    if (ext !== '.md') {
      // Non-markdown file — treat as potential attachment.
      const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf'];
      if (imageExts.includes(ext)) {
        attachments.push(relativePath);
      } else {
        skipped.push({ relativePath, reason: 'Not a Markdown or image file.' });
      }
      continue;
    }

    // Read the file content.
    let content: string;
    let sizeBytes: number;
    try {
      const [raw, fileStat] = await Promise.all([
        readFile(absolutePath, 'utf-8'),
        statFile(absolutePath),
      ]);
      content = raw;
      sizeBytes = fileStat.size;
    } catch {
      skipped.push({ relativePath, reason: 'Could not read file.' });
      continue;
    }

    const filenameStem = path.basename(relativePath, '.md');
    const title = extractTitle(content, filenameStem);
    const wikiLinkCount = countWikiLinks(content);
    const embedCount = countEmbeds(content);

    // Classify as daily note if it lives under the daily notes folder.
    if (dailyRoot && (relativePath.startsWith(`${dailyRoot}/`) || relativePath === dailyRoot)) {
      const relativeToDaily = relativePath.slice(dailyRoot.length + 1); // strip "Daily Notes/"
      const date = tryParseDailyDate(relativeToDaily);

      if (date !== null) {
        const status: ImportItemStatus = existingDailyDates?.has(date) ? 'exists' : 'new';
        scannedDailyNotes.push({ relativePath, date, title, wikiLinkCount, embedCount, sizeBytes, status });
        continue;
      }
      // Date couldn't be parsed — treat as regular note (unusual naming).
    }

    const status: ImportItemStatus = existingTitles?.has(title) ? 'exists' : 'new';
    scannedNotes.push({ relativePath, title, wikiLinkCount, embedCount, sizeBytes, status });
  }

  // Sort: notes by path (new first, then existing), daily notes by date.
  scannedNotes.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'new' ? -1 : 1;
    return a.relativePath.localeCompare(b.relativePath);
  });
  scannedDailyNotes.sort((a, b) => a.date.localeCompare(b.date));

  return { vaultPath, notes: scannedNotes, dailyNotes: scannedDailyNotes, attachments, skipped };
}

// Re-export helpers needed by the importer.
export { stripFrontmatter, countWikiLinks };
