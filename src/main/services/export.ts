/**
 * Export service.
 *
 * Handles all data-export operations: single note → .md, all notes →
 * directory of .md files, tasks → .csv, DB backup (VACUUM INTO), and
 * encryption-key export. Every function shows a native Save/Open dialog so
 * the renderer never deals with file paths or key material directly.
 *
 * Security properties:
 *   - All file I/O happens in the main (trusted) process.
 *   - The renderer only supplies logical IDs and filter flags — never
 *     raw file paths or encryption keys.
 *   - dialog.showSaveDialog / showOpenDialog are called with explicit
 *     filters so the user cannot accidentally overwrite arbitrary files.
 *   - The DB backup uses VACUUM INTO, which produces a fully-checkpointed,
 *     consistent snapshot regardless of WAL state. copyFileSync is NOT used
 *     because WAL-mode databases have three files; a naive file copy of only
 *     the main file can be incomplete or corrupt.
 */

import { dialog, app } from 'electron';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  chmodSync,
} from 'fs';
import { join } from 'path';
import { getDrizzle } from '../db/drizzle';
import { getDb, getDbKey } from '../db/index';
import { notes, tasks, taskLabels, labels, projects } from '../db/schema';
import { and, asc, desc, eq, isNull, inArray } from 'drizzle-orm';
import { getAll as getSettings } from './settings';
// Import directly from the leaf module, NOT the markdown barrel — the barrel
// pulls in schema.ts (TipTap/getSchema), which must never load in the main
// process (no DOM in Node). imageSrcs.ts is pure string work.
import { mapImageSrcs } from '../../shared/markdown/imageSrcs';
import { resolveAttachmentPath, AttachmentPathError } from '../security/attachment-path';
import { markdownToDocx, markdownToPdf } from './markdown-export';
import type {
  ExportNoteInput,
  ExportAllNotesInput,
  ExportTasksInput,
  ExportResult,
  ExportFormat,
} from '../../shared/schemas/export';

/** Per-format file extension + Save-dialog filter label for note exports. */
const NOTE_FORMAT_META: Record<ExportFormat, { ext: string; filterName: string }> = {
  md: { ext: 'md', filterName: 'Markdown' },
  docx: { ext: 'docx', filterName: 'Word Document' },
  pdf: { ext: 'pdf', filterName: 'PDF' },
};

/**
 * Render a note's full Markdown (title + inlined body) into the bytes for the
 * requested format. Markdown passes through verbatim; docx/pdf are built from it.
 */
function renderNoteBytes(
  fullMarkdown: string,
  format: ExportFormat,
): Promise<string | Buffer> {
  switch (format) {
    case 'md':
      return Promise.resolve(fullMarkdown);
    case 'docx':
      return markdownToDocx(fullMarkdown);
    case 'pdf':
      return markdownToPdf(fullMarkdown);
  }
}

/** Prepend the title as an H1 unless the body already starts with it. */
function withTitle(title: string, body: string): string {
  return title && !body.startsWith(`# ${title}`) ? `# ${title}\n\n${body}` : body;
}

/** Map a filename extension to an image MIME type for data: URIs. */
const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

/**
 * Inline every `attachment://<noteId>/<file>` image in a markdown body as a
 * self-contained `data:` URI, so the exported `.md` renders outside Cinder.
 * The attachment path is validated (UUID note id, separator-free filename, no
 * symlink escape) exactly as the protocol handler does; an unreadable or
 * invalid reference is left untouched rather than failing the whole export.
 *
 * `drawing://` live embeds are inlined separately, by the renderer, before the
 * body reaches here (see useExport) — main can't rasterize them.
 */
function inlineAttachments(body: string): Promise<string> {
  return mapImageSrcs(body, (src) => {
    if (!src.startsWith('attachment://')) return Promise.resolve(null);
    try {
      const url = new URL(src);
      const noteId = url.hostname;
      const filename = decodeURIComponent(url.pathname.replace(/^\//, ''));
      const abs = resolveAttachmentPath(noteId, filename);
      const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
      const mime = EXT_TO_MIME[ext] ?? 'application/octet-stream';
      const b64 = readFileSync(abs).toString('base64');
      return Promise.resolve(`data:${mime};base64,${b64}`);
    } catch (err) {
      if (!(err instanceof AttachmentPathError)) {
        // ENOENT etc. — leave the ref as-is; don't crash the export.
      }
      return Promise.resolve(null);
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Make a filesystem-safe filename from an arbitrary string. */
function safeName(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, '-')   // replace FS-illegal chars
    .replace(/\s+/g, '-')             // spaces → dashes
    .replace(/-{2,}/g, '-')           // collapse multiple dashes
    .replace(/^-|-$/g, '')            // trim leading/trailing dashes
    .slice(0, 120) || 'untitled';     // hard length limit + fallback
}

/** Format a nullable date string for CSV output. */
function csvDate(value: string | null): string {
  return value === null ? '' : value.slice(0, 10); // YYYY-MM-DD
}

/** Escape a value for inclusion in a CSV cell. */
function csvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  // Wrap in quotes if the value contains commas, quotes, or newlines.
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',');
}

/**
 * Run VACUUM INTO on the live database.
 * Creates a fully-checkpointed, consistent encrypted snapshot at `destPath`
 * regardless of WAL state. The output is encrypted with the same key.
 *
 * Single-quotes in the path are doubled to prevent SQL injection; this is
 * the standard SQLite escaping for string literals (not a parameterised
 * query — VACUUM INTO does not support bind parameters for the path).
 *
 * Exported for the restore flow's pre-restore safety snapshot.
 */
export function vacuumInto(destPath: string): Promise<void> {
  const escaped = destPath.replace(/'/g, "''");
  return new Promise((resolve, reject) => {
    getDb().run(`VACUUM INTO '${escaped}'`, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ── Export a single note ──────────────────────────────────────────────────────

export async function exportNote(input: ExportNoteInput): Promise<ExportResult> {
  const db = getDrizzle();
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, input.noteId), isNull(notes.deletedAt)))
    .limit(1);

  const note = rows[0];
  if (!note) {
    return { success: false, reason: 'error', message: 'Note not found.' };
  }

  const format = input.format ?? 'md';
  const meta = NOTE_FORMAT_META[format];
  const defaultFilename = `${safeName(note.title || 'untitled')}.${meta.ext}`;

  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Export Note',
    defaultPath: join(app.getPath('documents'), defaultFilename),
    filters: [{ name: meta.filterName, extensions: [meta.ext] }],
    properties: ['createDirectory'],
  });

  if (canceled || !filePath) {
    return { success: false, reason: 'cancelled' };
  }

  // The renderer may pass a body with live `drawing://` embeds already inlined
  // as data: URIs (only it can rasterize them); fall back to the stored body.
  // Then inline `attachment://` images here so the export is self-contained.
  const baseBody = input.body ?? note.body;
  const body = await inlineAttachments(baseBody);

  // Prepend the title as an H1 if the body doesn't already start with it, then
  // render to the chosen format (md verbatim, docx/pdf built from the markdown).
  const fullMarkdown = withTitle(note.title, body);
  try {
    writeFileSync(filePath, await renderNoteBytes(fullMarkdown, format));
  } catch (err) {
    return {
      success: false,
      reason: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
  return { success: true, path: filePath };
}

// ── Export all notes ─────────────────────────────────────────────────────────

export async function exportAllNotes(input: ExportAllNotesInput): Promise<ExportResult> {
  const format = input.format ?? 'md';
  const meta = NOTE_FORMAT_META[format];

  const db = getDrizzle();
  const allNotes = await db
    .select()
    .from(notes)
    .where(isNull(notes.deletedAt))
    .orderBy(desc(notes.updatedAt));

  if (allNotes.length === 0) {
    return { success: false, reason: 'error', message: 'No notes to export.' };
  }

  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: 'Export All Notes — Choose Destination Folder',
    defaultPath: app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Export here',
    message: `${allNotes.length} note${allNotes.length === 1 ? '' : 's'} will be exported as .${meta.ext} files`,
  });

  if (canceled || !filePaths[0]) {
    return { success: false, reason: 'cancelled' };
  }

  const destDir = filePaths[0];

  // Track used filenames to avoid collisions when multiple notes have
  // the same title.
  const usedNames = new Set<string>();

  try {
    for (const note of allNotes) {
      const name = safeName(note.title || 'untitled');
      let filename = `${name}.${meta.ext}`;
      let counter = 1;
      while (usedNames.has(filename)) {
        filename = `${name}-${counter}.${meta.ext}`;
        counter++;
      }
      usedNames.add(filename);

      // Inline attachment:// images so each file is self-contained. (Live
      // drawing:// embeds can't be rasterized here — main has no canvas — so in
      // a bulk export they remain references; use single-note export or Snapshot
      // mode for portable drawings.)
      const body = await inlineAttachments(note.body);
      const fullMarkdown = withTitle(note.title, body);
      writeFileSync(join(destDir, filename), await renderNoteBytes(fullMarkdown, format));
    }
  } catch (err) {
    return {
      success: false,
      reason: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  return { success: true, path: destDir };
}

// ── Export tasks as CSV ───────────────────────────────────────────────────────

export async function exportTasks(input: ExportTasksInput): Promise<ExportResult> {
  const db = getDrizzle();

  // Build WHERE conditions.
  const conditions = [isNull(tasks.deletedAt)];
  if (!input.includeCompleted) conditions.push(isNull(tasks.completedAt));
  if (input.projectId !== undefined) {
    conditions.push(eq(tasks.projectId, input.projectId));
  }

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      dueRecurrence: tasks.dueRecurrence,
      projectId: tasks.projectId,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .where(and(...conditions))
    .orderBy(asc(tasks.priority), asc(tasks.dueDate), asc(tasks.order));

  if (rows.length === 0) {
    return { success: false, reason: 'error', message: 'No tasks to export.' };
  }

  // Fetch project names for all referenced project IDs.
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((id): id is string => id !== null))];
  const projectMap = new Map<string, string>();
  if (projectIds.length > 0) {
    const projectRows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(inArray(projects.id, projectIds));
    for (const p of projectRows) projectMap.set(p.id, p.name);
  }

  // Fetch labels for all task IDs.
  const taskIds = rows.map((r) => r.id);
  const labelRows = taskIds.length > 0
    ? await db
        .select({ taskId: taskLabels.taskId, name: labels.name })
        .from(taskLabels)
        .innerJoin(labels, eq(taskLabels.labelId, labels.id))
        .where(inArray(taskLabels.taskId, taskIds))
    : [];

  const labelsByTask = new Map<string, string[]>();
  for (const lr of labelRows) {
    const arr = labelsByTask.get(lr.taskId) ?? [];
    arr.push(lr.name);
    labelsByTask.set(lr.taskId, arr);
  }

  // Build CSV.
  const header = csvRow([
    'ID', 'Title', 'Description', 'Priority', 'Due Date',
    'Recurrence', 'Project', 'Labels', 'Completed At',
    'Created At', 'Updated At',
  ]);

  const dataRows = rows.map((r) =>
    csvRow([
      r.id,
      r.title,
      r.description,
      r.priority,
      csvDate(r.dueDate),
      r.dueRecurrence ?? '',
      r.projectId ? (projectMap.get(r.projectId) ?? r.projectId) : '',
      (labelsByTask.get(r.id) ?? []).join('; '),
      r.completedAt ? csvDate(r.completedAt) : '',
      csvDate(r.createdAt),
      csvDate(r.updatedAt),
    ]),
  );

  const csv = [header, ...dataRows].join('\r\n');

  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Export Tasks as CSV',
    defaultPath: join(app.getPath('documents'), 'cinder-tasks.csv'),
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    properties: ['createDirectory'],
  });

  if (canceled || !filePath) {
    return { success: false, reason: 'cancelled' };
  }

  writeFileSync(filePath, csv, 'utf-8');
  return { success: true, path: filePath };
}

// ── Database backup ───────────────────────────────────────────────────────────

export async function exportBackup(): Promise<ExportResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const defaultFilename = `cinder-backup-${timestamp}.db`;

  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Back Up Database',
    defaultPath: join(app.getPath('documents'), defaultFilename),
    filters: [{ name: 'Cinder Database', extensions: ['db'] }],
    properties: ['createDirectory'],
  });

  if (canceled || !filePath) {
    return { success: false, reason: 'cancelled' };
  }

  try {
    // VACUUM INTO creates a fully-checkpointed, consistent snapshot of the
    // live database — safe even while WAL writes are in flight. The output
    // is encrypted with the same SQLCipher key as the source.
    await vacuumInto(filePath);
  } catch (err) {
    return {
      success: false,
      reason: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // Prompt the user to also export their encryption key so the backup is
  // restorable on a different Mac or after a Keychain loss.
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Backup saved',
    message: 'Database backed up successfully.',
    detail:
      'Important: this backup is encrypted with your device key, which lives ' +
      'in the macOS Keychain. To restore it on a different Mac or after ' +
      'reinstalling macOS, you will also need your encryption key.\n\n' +
      'Would you like to export your key now?',
    buttons: ['Export key…', 'Skip'],
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 0) {
    await exportKeyBackup();
  }

  return { success: true, path: filePath };
}

// ── Encryption key export ─────────────────────────────────────────────────────

/**
 * Export the database encryption key to a text file chosen by the user.
 *
 * Security design: the raw key never touches the renderer. The main process
 * retrieves it from the in-memory cache (populated at startup from the
 * Keychain), then writes it directly to a file the user selects via a native
 * dialog. The file is chmod 0600 (owner read/write only).
 */
export async function exportKeyBackup(): Promise<ExportResult> {
  let key: string;
  try {
    key = getDbKey();
  } catch {
    return { success: false, reason: 'error', message: 'Encryption key not available.' };
  }

  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Export Encryption Key',
    defaultPath: join(app.getPath('documents'), 'cinder-key.txt'),
    filters: [{ name: 'Text File', extensions: ['txt'] }],
    properties: ['createDirectory'],
  });

  if (canceled || !filePath) {
    return { success: false, reason: 'cancelled' };
  }

  const content = [
    'Cinder Database Encryption Key',
    '================================',
    '',
    'Keep this file somewhere safe — separate from your database backup.',
    'Anyone who has both this key and a database backup file can read',
    'all of your notes and tasks.',
    '',
    'Good places to store it: a password manager, or an encrypted USB drive',
    'kept in a different physical location from your Mac.',
    '',
    `Key: ${key}`,
    '',
    `Exported: ${new Date().toISOString()}`,
    `App version: ${app.getVersion()}`,
  ].join('\n');

  writeFileSync(filePath, content, 'utf-8');
  chmodSync(filePath, 0o600); // owner read/write only

  await dialog.showMessageBox({
    type: 'warning',
    title: 'Store this key safely',
    message: 'Encryption key exported.',
    detail:
      'Store this file somewhere safe and separate from your database backup ' +
      '— a password manager is ideal. Delete it from Downloads or Desktop ' +
      'once it is in a safe place.',
    buttons: ['OK'],
  });

  return { success: true, path: filePath };
}

// ── Automatic backup on quit ──────────────────────────────────────────────────

/**
 * Silently back up the database to the auto-backup directory
 * (`userData/backups/`) and rotate old files if the kept count exceeds
 * `backup.keepCount`.
 *
 * Called from the `will-quit` handler in index.ts. Any errors are swallowed
 * so a backup failure never prevents the app from quitting.
 */
export async function runAutoBackup(): Promise<void> {
  const s = await getSettings();
  if (!s['backup.autoOnQuit']) return;

  const backupsDir = join(app.getPath('userData'), 'backups');
  mkdirSync(backupsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destPath = join(backupsDir, `auto-backup-${timestamp}.db`);

  await vacuumInto(destPath);

  // Rotate: keep only the most-recent `keepCount` auto-backups.
  const keepCount = s['backup.keepCount'];
  const existing = readdirSync(backupsDir)
    .filter((f) => f.startsWith('auto-backup-') && f.endsWith('.db'))
    .sort(); // lexicographic == chronological because of YYYY-MM-DD prefix

  if (existing.length > keepCount) {
    const toDelete = existing.slice(0, existing.length - keepCount);
    for (const f of toDelete) {
      try {
        unlinkSync(join(backupsDir, f));
      } catch {
        // Ignore individual deletion failures; don't block the quit.
      }
    }
  }
}
