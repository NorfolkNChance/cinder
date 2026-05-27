import { Notification } from 'electron';
import type { BrowserWindow } from 'electron';
import { tasksService } from './tasks';
import { settingsService } from './settings';
import { NOTIFY_TASK_DUE } from '../../shared/ipc/channels';

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Today's date as a local YYYY-MM-DD string, matching the DB's dueDate format. */
function todayLocal(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Tomorrow's date as a local YYYY-MM-DD string. Used as a strict upper bound. */
function tomorrowLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Milliseconds from now until local midnight. */
function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

// ── Module state ──────────────────────────────────────────────────────────────

/**
 * Task IDs that have already produced a notification in the current calendar
 * day. Reset at midnight so overdue tasks surface again each new day.
 */
const notifiedIds = new Set<string>();

let checkIntervalId: ReturnType<typeof setInterval> | null = null;
let midnightTimeoutId: ReturnType<typeof setTimeout> | null = null;
let startupTimeoutId: ReturnType<typeof setTimeout> | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the notification scheduler.
 *
 * - Fires an initial check ~15 s after startup (gives the app time to settle).
 * - Rechecks every 15 minutes thereafter.
 * - Resets the notified-IDs set at midnight and immediately runs a fresh check.
 *
 * `mainWindowGetter` is called at notification-click time so it always
 * resolves the *current* main window, even if the window was closed and
 * recreated after `initNotifier` was first called.
 */
export function initNotifier(mainWindowGetter: () => BrowserWindow | null): void {
  if (!Notification.isSupported()) return;

  // Staggered startup check — avoids hammering the DB at cold-start.
  startupTimeoutId = setTimeout(() => {
    void checkAndNotify(mainWindowGetter);
  }, 15_000);

  // Periodic check every 15 minutes.
  checkIntervalId = setInterval(() => {
    void checkAndNotify(mainWindowGetter);
  }, 15 * 60 * 1000);

  // Midnight reset — clears notified set and fires a fresh check.
  scheduleMidnightReset(mainWindowGetter);
}

/** Unregister all timers. Call from `app.on('will-quit')`. */
export function cleanupNotifier(): void {
  if (startupTimeoutId !== null) clearTimeout(startupTimeoutId);
  if (checkIntervalId !== null) clearInterval(checkIntervalId);
  if (midnightTimeoutId !== null) clearTimeout(midnightTimeoutId);
  startupTimeoutId = null;
  checkIntervalId = null;
  midnightTimeoutId = null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function scheduleMidnightReset(mainWindowGetter: () => BrowserWindow | null): void {
  midnightTimeoutId = setTimeout(() => {
    notifiedIds.clear();
    void checkAndNotify(mainWindowGetter);
    // Reschedule for the next midnight.
    scheduleMidnightReset(mainWindowGetter);
  }, msUntilMidnight());
}

/**
 * Query for tasks due today or overdue, filter to those not yet notified
 * this session, and fire a native macOS notification.
 */
async function checkAndNotify(
  mainWindowGetter: () => BrowserWindow | null,
): Promise<void> {
  const settings = await settingsService.getAll();
  if (!settings['notifications.enabled']) return;

  // All active, non-triage tasks with a due date on or before today.
  const allDue = await tasksService.list({ dueBefore: tomorrowLocal() });

  const newlyDue = allDue.filter((t) => !notifiedIds.has(t.id));
  if (newlyDue.length === 0) return;

  // Mark as notified before showing — avoids double-fire if the async
  // show() somehow overlaps with a concurrent check.
  for (const t of newlyDue) notifiedIds.add(t.id);

  // Separate today's tasks from overdue to craft clearer messages.
  const today = todayLocal();
  const dueToday = newlyDue.filter((t) => t.dueDate === today);
  const overdue = newlyDue.filter(
    (t) => t.dueDate !== null && t.dueDate < today,
  );

  if (dueToday.length > 0) {
    fireNotification(dueToday, 'due today', mainWindowGetter);
  }
  if (overdue.length > 0) {
    fireNotification(overdue, 'overdue', mainWindowGetter);
  }
}

function fireNotification(
  tasks: readonly { id: string; title: string }[],
  label: string,
  mainWindowGetter: () => BrowserWindow | null,
): void {
  const count = tasks.length;

  const title =
    count === 1
      ? (tasks[0]?.title ?? 'Task')
      : `${count} tasks ${label}`;

  const body =
    count === 1
      ? `${label.charAt(0).toUpperCase() + label.slice(1)} — click to open Cinder`
      : tasks
          .slice(0, 3)
          .map((t) => t.title)
          .join(', ') + (count > 3 ? ` +${count - 3} more` : '');

  const n = new Notification({ title, body, silent: false });

  n.on('click', () => {
    const win = mainWindowGetter();
    if (win === null || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    // Push a message to the renderer so it navigates to Tasks › Today.
    win.webContents.send(NOTIFY_TASK_DUE);
  });

  n.show();
}
