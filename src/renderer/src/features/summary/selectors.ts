import {
  classifyTask,
  type MatrixPrefs,
} from '../../../../shared/matrix/classify';
import type { TaskWithLabels } from '../../../../shared/schemas/tasks';

/**
 * Pure selection/grouping logic for the Summary cards. No React, no DOM —
 * unit-testable in plain Node (see selectors.test.ts).
 *
 * Date handling mirrors the rest of the app: due dates may be date-only
 * ('YYYY-MM-DD') or full ISO datetimes. Day arithmetic always goes through
 * the date-only prefix parsed as LOCAL year/month/day — parsing a date-only
 * string with `new Date(str)` would read it as UTC midnight, which lands on
 * the previous day in timezones west of UTC (see CLAUDE.md gotchas).
 */

/** Calendar-day difference between a due date and today: negative = overdue. */
export function dayDiff(dueDate: string, todayLocal: string): number {
  const due = parseLocalDay(dueDate.slice(0, 10));
  const today = parseLocalDay(todayLocal);
  if (due === null || today === null) return 0;
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function parseLocalDay(yyyyMmDd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Split a "Today scope" result set (due on or before today) into overdue
 * and due-today halves. Tasks without a due date can't appear in that
 * scope, but are routed to `today` defensively if they ever do.
 */
export function splitTodayScope<T extends { dueDate: string | null }>(
  tasks: readonly T[],
  todayLocal: string,
): { overdue: T[]; today: T[] } {
  const overdue: T[] = [];
  const today: T[] = [];
  for (const t of tasks) {
    if (t.dueDate !== null && dayDiff(t.dueDate, todayLocal) < 0) {
      overdue.push(t);
    } else {
      today.push(t);
    }
  }
  return { overdue, today };
}

export interface OverdueGroup<T> {
  label: 'Yesterday' | 'This week' | 'Older';
  tasks: T[];
}

/**
 * Group overdue tasks by how stale they are — the age is the signal the
 * card exists to surface. Groups with no tasks are omitted. Within a
 * group the most-recently-due tasks come first (least stale at the top).
 */
export function groupOverdue<T extends { dueDate: string | null }>(
  tasks: readonly T[],
  todayLocal: string,
): OverdueGroup<T>[] {
  const yesterday: T[] = [];
  const thisWeek: T[] = [];
  const older: T[] = [];
  for (const t of tasks) {
    if (t.dueDate === null) continue;
    const diff = dayDiff(t.dueDate, todayLocal);
    if (diff >= 0) continue;
    if (diff === -1) yesterday.push(t);
    else if (diff >= -7) thisWeek.push(t);
    else older.push(t);
  }
  const byDueDesc = (a: T, b: T): number =>
    (b.dueDate ?? '').localeCompare(a.dueDate ?? '');
  yesterday.sort(byDueDesc);
  thisWeek.sort(byDueDesc);
  older.sort(byDueDesc);

  const groups: OverdueGroup<T>[] = [];
  if (yesterday.length > 0) groups.push({ label: 'Yesterday', tasks: yesterday });
  if (thisWeek.length > 0) groups.push({ label: 'This week', tasks: thisWeek });
  if (older.length > 0) groups.push({ label: 'Older', tasks: older });
  return groups;
}

/**
 * The "Do first" short-list: Eisenhower Q1 (urgent + important, using the
 * user's matrix prefs), ordered by priority then due date, capped so it
 * stays a short-list rather than another backlog.
 */
export function pickDoFirst(
  tasks: readonly TaskWithLabels[],
  prefs: MatrixPrefs,
  cap = 5,
): TaskWithLabels[] {
  return tasks
    .filter((t) => classifyTask(t, prefs) === 'do')
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
        a.title.localeCompare(b.title),
    )
    .slice(0, cap);
}
