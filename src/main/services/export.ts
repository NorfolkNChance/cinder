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
import type {
  ExportNoteInput,
  ExportTasksInput,
  ExportResult,
} from '../../shared/schemas/export';

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
 */
function vacuumInto(destPath: string): Promise<void> {
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

  const defaultFilename = `${safeName(note.title || 'untitled')}.md`;

  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Export Note',
    defaultPath: join(app.getPath('documents'), defaultFilename),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
    properties: ['createDirectory'],
  });

  if (canceled || !filePath) {
    return { success: false, reason: 'cancelled' };
  }

  // Build the markdown file. Prepend the title as an H1 if the body
  // doesn't already start with it (so the file is self-contained).
  const titleLine =
    note.title && !note.body.startsWith(`# ${note.title}`)
      ? `# ${note.title}\n\n`
      : '';

  writeFileSync(filePath, `${titleLine}${note.body}`, 'utf-8');
  return { success: true, path: filePath };
}

// ── Export all notes ─────────────────────────────────────────────────────────

export async function exportAllNotes(): Promise<ExportResult> {
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
    message: `${allNotes.length} note${allNotes.length === 1 ? '' : 's'} will be exported as .md files`,
  });

  if (canceled || !filePaths[0]) {
    return { success: false, reason: 'cancelled' };
  }

  const destDir = filePaths[0];

  // Track used filenames to avoid collisions when multiple notes have
  // the same title.
  const usedNames = new Set<string>();

  for (const note of allNotes) {
    const name = safeName(note.title || 'untitled');
    let filename = `${name}.md`;
    let counter = 1;
    while (usedNames.has(filename)) {
      filename = `${name}-${counter}.md`;
      counter++;
    }
    usedNames.add(filename);

    const titleLine =
      note.title && !note.body.startsWith(`# ${note.title}`)
        ? `# ${note.title}\n\n`
        : '';

    writeFileSync(join(destDir, filename), `${titleLine}${note.body}`, 'utf-8');
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
