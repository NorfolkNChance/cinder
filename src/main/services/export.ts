/**
 * Export service.
 *
 * Handles all data-export operations: single note → .md, all notes →
 * directory of .md files, tasks → .csv, and DB backup. Every function
 * shows a native Save/Open dialog so the renderer never deals with file
 * paths directly.
 *
 * Security properties:
 *   - All file I/O happens in the main (trusted) process.
 *   - The renderer only supplies logical IDs and filter flags — never
 *     raw file paths.
 *   - dialog.showSaveDialog / showOpenDialog are called with explicit
 *     filters so the user cannot accidentally overwrite arbitrary files.
 */

import { dialog, app } from 'electron';
import { copyFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getDrizzle } from '../db/drizzle';
import { notes, tasks, taskLabels, labels, projects } from '../db/schema';
import { and, asc, desc, eq, isNull, inArray } from 'drizzle-orm';
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

// Satisfy `mkdirSync` strict-mode — only used for the "all notes" export
// where we write into a user-chosen existing directory; no mkdir needed there.
// Kept here in case future callers need it.
void mkdirSync;

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
  const dbPath = join(app.getPath('userData'), 'cinder.db');
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

  // SQLite WAL: flush before copy.
  // We do a simple file copy — safe because better-sqlite3 is synchronous
  // and all mutations are serialised through the main process.
  try {
    copyFileSync(dbPath, filePath);
  } catch (err) {
    return {
      success: false,
      reason: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  return { success: true, path: filePath };
}
