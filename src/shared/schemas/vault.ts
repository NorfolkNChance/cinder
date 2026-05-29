import { z } from 'zod';

/**
 * Zod schemas for the Obsidian vault import domain.
 *
 * The import is a two-step operation deliberately separated:
 *   1. vault:scan   — reads the vault from disk, returns metadata, zero DB writes.
 *   2. vault:import — takes the confirmed plan, writes to DB, emits progress events.
 *
 * The user sees a preview of every action before anything is committed.
 */

const RelativePath = z.string().min(1);

// ── Scan input ────────────────────────────────────────────────────────────────

/** Input for vault:scan. The vaultPath is returned by vault:pickFolder. */
export const VaultScanInput = z.object({
  /** Absolute path to the Obsidian vault root directory. */
  vaultPath: z.string().min(1),
  /**
   * Name of the folder inside the vault that contains daily notes.
   * Relative to the vault root, e.g. "Daily Notes".
   * The scanner uses this to classify files as daily notes vs regular notes.
   */
  dailyNotesFolder: z.string(),
});
export type VaultScanInput = z.infer<typeof VaultScanInput>;

// ── Scan result ───────────────────────────────────────────────────────────────

/** A regular note discovered during vault scan (no body — read during import). */
export const ScannedNote = z.object({
  /** Path relative to the vault root, e.g. "Projects/Work/Meeting notes.md". */
  relativePath: RelativePath,
  /** Title extracted from the first # heading, or the filename stem. */
  title: z.string(),
  /** Number of [[wiki link]] occurrences. Used to show warnings in the preview. */
  wikiLinkCount: z.number().int().min(0),
  /** File size in bytes. */
  sizeBytes: z.number().int().min(0),
});
export type ScannedNote = z.infer<typeof ScannedNote>;

/** A daily note discovered during vault scan. */
export const ScannedDailyNote = z.object({
  relativePath: RelativePath,
  /** Parsed calendar date in YYYY-MM-DD format. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Title extracted from the note content, or the date string. */
  title: z.string(),
  wikiLinkCount: z.number().int().min(0),
  sizeBytes: z.number().int().min(0),
});
export type ScannedDailyNote = z.infer<typeof ScannedDailyNote>;

/** A file that cannot be imported and why. */
export const SkippedFile = z.object({
  relativePath: RelativePath,
  reason: z.string(),
});
export type SkippedFile = z.infer<typeof SkippedFile>;

/** Full result returned by vault:scan. Contains metadata only; no body text. */
export const VaultScanResult = z.object({
  vaultPath: z.string(),
  notes: z.array(ScannedNote),
  dailyNotes: z.array(ScannedDailyNote),
  /** Relative paths of non-Markdown files (images, PDFs, etc.) */
  attachments: z.array(RelativePath),
  skipped: z.array(SkippedFile),
});
export type VaultScanResult = z.infer<typeof VaultScanResult>;

// ── Import plan & options ─────────────────────────────────────────────────────

export const VaultImportOptions = z.object({
  /**
   * How to handle Obsidian [[wiki links]] in note bodies.
   *   'plain-text' — strip the brackets, keep the display text (or target name).
   *   'leave-as-is' — keep [[...]] literally (renders as text in TipTap).
   */
  wikiLinks: z.enum(['plain-text', 'leave-as-is']),
  /**
   * How to encode the Obsidian folder hierarchy in note titles.
   * Cinder has no real folder support yet, so the path is prepended to the title.
   *   'top-level' — "Projects / Meeting notes"
   *   'full-path' — "Projects/Work / Meeting notes"
   *   'none'      — "Meeting notes"
   */
  folderPrefix: z.enum(['top-level', 'full-path', 'none']),
  /** Name of the vault folder that holds daily notes. */
  dailyNotesFolder: z.string(),
});
export type VaultImportOptions = z.infer<typeof VaultImportOptions>;

/**
 * The confirmed import plan sent to vault:import.
 * Contains only the paths the user chose to import (they may deselect items
 * in the preview). Options control how body text is transformed.
 */
export const VaultImportPlan = z.object({
  vaultPath: z.string().min(1),
  noteRelativePaths: z.array(RelativePath),
  dailyNoteRelativePaths: z.array(RelativePath),
  options: VaultImportOptions,
});
export type VaultImportPlan = z.infer<typeof VaultImportPlan>;

// ── Progress & result ─────────────────────────────────────────────────────────

/** Push event emitted during vault:import. Renderer updates a progress bar. */
export const VaultProgress = z.object({
  phase: z.enum(['notes', 'daily-notes', 'done', 'error']),
  current: z.number().int().min(0),
  total: z.number().int().min(0),
  /** Set when phase === 'error'. */
  message: z.string().optional(),
});
export type VaultProgress = z.infer<typeof VaultProgress>;

/** Final result returned by vault:import when all items have been processed. */
export const VaultImportResult = z.object({
  notesCreated: z.number().int().min(0),
  dailyNotesCreated: z.number().int().min(0),
  /** Paths that failed to import. */
  errors: z.array(z.string()),
});
export type VaultImportResult = z.infer<typeof VaultImportResult>;
