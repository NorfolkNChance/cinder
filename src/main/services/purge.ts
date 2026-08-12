import { lt, and, isNotNull } from 'drizzle-orm';
import { getDrizzle } from '../db/drizzle';
import { notes, tasks } from '../db/schema';
import { notesService } from './notes';
import { tasksService } from './tasks';
import { getAll as getSettings } from './settings';

/**
 * Trash purge job.
 *
 * Hard-deletes notes and tasks whose `deleted_at` is older than the
 * retention window (`trash.retentionDays`, default 30). This closes the
 * gap between the soft-delete design and the privacy promise: without it,
 * "deleted" data lives in the encrypted DB forever.
 *
 * Runs shortly after startup and then every 12 hours while the app is
 * open. Deletions go through the service-layer hardDelete methods so the
 * note attachment cleanup and FK cascades behave exactly as they do for a
 * manual "Delete forever" from the Trash view.
 *
 * The purge is opt-out: `trash.autoPurgeEnabled = false` keeps trashed
 * items until the user empties the Trash manually.
 */

/** Delay after startup before the first purge — keep boot I/O-quiet. */
const STARTUP_DELAY_MS = 60_000;
/** Re-check interval while the app stays open. */
const INTERVAL_MS = 12 * 60 * 60 * 1000;

export interface PurgeResult {
  readonly notesPurged: number;
  readonly tasksPurged: number;
}

/**
 * The ISO-8601 timestamp before which trashed items are eligible for
 * purging. Pure — exported for unit tests.
 */
export function computePurgeCutoff(now: Date, retentionDays: number): string {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Run one purge pass. Returns counts for logging/tests. Individual row
 * failures are logged and skipped — one bad row must not wedge the purge
 * forever.
 */
export async function runTrashPurge(): Promise<PurgeResult> {
  const settings = await getSettings();
  if (!settings['trash.autoPurgeEnabled']) {
    return { notesPurged: 0, tasksPurged: 0 };
  }

  const cutoff = computePurgeCutoff(new Date(), settings['trash.retentionDays']);
  const db = getDrizzle();

  // ISO-8601 UTC strings compare correctly as text — same convention the
  // rest of the codebase relies on for timestamp ordering.
  const expiredNotes = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(isNotNull(notes.deletedAt), lt(notes.deletedAt, cutoff)));

  const expiredTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(isNotNull(tasks.deletedAt), lt(tasks.deletedAt, cutoff)));

  let notesPurged = 0;
  for (const row of expiredNotes) {
    try {
      await notesService.hardDelete(row.id);
      notesPurged++;
    } catch (err) {
      console.error(`[cinder] purge: failed to delete note ${row.id}:`, err);
    }
  }

  let tasksPurged = 0;
  for (const row of expiredTasks) {
    try {
      await tasksService.hardDelete(row.id);
      tasksPurged++;
    } catch (err) {
      // A subtask may already be gone via its parent's cascade — treat
      // "row no longer exists" the same as success next pass.
      console.error(`[cinder] purge: failed to delete task ${row.id}:`, err);
    }
  }

  if (notesPurged > 0 || tasksPurged > 0) {
    console.log(
      `[cinder] trash purge: removed ${notesPurged} note(s), ${tasksPurged} task(s) older than ${settings['trash.retentionDays']}d`,
    );
  }
  return { notesPurged, tasksPurged };
}

let _startupTimer: NodeJS.Timeout | null = null;
let _interval: NodeJS.Timeout | null = null;

/**
 * Schedule the purge: once shortly after startup, then every 12 hours.
 * Call from app.whenReady() after the DB is initialised.
 */
export function initPurge(): void {
  _startupTimer = setTimeout(() => {
    void runTrashPurge().catch((err: unknown) => {
      console.error('[cinder] trash purge failed:', err);
    });
  }, STARTUP_DELAY_MS);

  _interval = setInterval(() => {
    void runTrashPurge().catch((err: unknown) => {
      console.error('[cinder] trash purge failed:', err);
    });
  }, INTERVAL_MS);
}

/** Clear the purge timers. Call from will-quit. */
export function cleanupPurge(): void {
  if (_startupTimer !== null) clearTimeout(_startupTimer);
  if (_interval !== null) clearInterval(_interval);
  _startupTimer = null;
  _interval = null;
}
