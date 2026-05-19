/**
 * Date utilities for the Tasks UI.
 *
 * The renderer works in the user's local timezone — Today / Upcoming
 * boundaries are calculated against `new Date()` at the moment the
 * filter is built. Stored values (`due_date` in the DB) may be either
 * date-only (`YYYY-MM-DD`) or full ISO datetime; the filtering relies
 * on lexicographic ordering of these strings, which is valid as long
 * as the format is year-first fixed-width.
 */

/** Format a Date as YYYY-MM-DD in the local timezone (not UTC). */
export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Return `date` shifted by `days` calendar days. Pure — does not mutate. */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Format a stored due-date string for compact display on a task row.
 *
 *   null / undefined → ''
 *   today            → 'Today'
 *   tomorrow         → 'Tomorrow'
 *   yesterday        → 'Yesterday'
 *   < today          → 'Overdue: MMM d'
 *   within 7 days    → weekday short ('Mon', 'Tue', …)
 *   else             → 'MMM d' (this year) or 'MMM d, YYYY'
 */
export function formatDueDate(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';

  // For date-only strings, parsing via new Date() interprets them as UTC
  // midnight, which can land on the "previous day" in negative offsets.
  // Construct from the components when the value looks date-only.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(value);
  const dueDate = dateOnly
    ? new Date(
        Number(dateOnly[0].slice(0, 4)),
        Number(dateOnly[0].slice(5, 7)) - 1,
        Number(dateOnly[0].slice(8, 10)),
      )
    : new Date(value);

  if (Number.isNaN(dueDate.getTime())) return '';

  const today = startOfDay(new Date());
  const dueDay = startOfDay(dueDate);
  const diff = Math.round(
    (dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `Overdue: ${shortDate(dueDate)}`;
  if (diff > 0 && diff < 7) return weekdayShort(dueDate);
  return shortDate(dueDate);
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function shortDate(d: Date): string {
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function weekdayShort(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

/** Is the due-date string in the past relative to "today" (local)? */
export function isOverdue(value: string | null | undefined): boolean {
  if (value === null || value === undefined || value === '') return false;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const dueDate = dateOnly ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(dueDate.getTime())) return false;
  return startOfDay(dueDate).getTime() < startOfDay(new Date()).getTime();
}
