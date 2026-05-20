/**
 * Eisenhower matrix classification.
 *
 * A pure, framework-free module — importable from both main and renderer.
 *
 * Classification axes (§6.3):
 *   Urgency   — derived from due_date. "Urgent" = due on or before
 *               (today + urgencyDays). urgencyDays=0 means today/overdue
 *               only; urgencyDays=3 means "due within the next 3 days".
 *               Tasks with no due date are never urgent.
 *
 *   Importance — derived from priority. "Important" = priority <=
 *               importanceCutoff. Default cutoff = 2 (P1+P2 are important;
 *               P3+P4 are not).
 *
 * Quadrant labels follow the canonical Eisenhower naming:
 *   Q1 "do"        — urgent + important
 *   Q2 "schedule"  — not urgent + important
 *   Q3 "delegate"  — urgent + not important
 *   Q4 "eliminate" — not urgent + not important
 */

export type Quadrant = 'do' | 'schedule' | 'delegate' | 'eliminate';

export interface MatrixPrefs {
  /**
   * Number of days from today that count as "urgent".
   * 0 = today/overdue only. Must be >= 0.
   */
  urgencyDays: number;
  /**
   * Priority threshold. Tasks with priority <= this value are "important".
   * 1 = only P1; 2 = P1+P2 (default); 3 = P1+P2+P3; 4 = everything.
   */
  importanceCutoff: 1 | 2 | 3 | 4;
}

export const DEFAULT_MATRIX_PREFS: MatrixPrefs = {
  urgencyDays: 0,
  importanceCutoff: 2,
};

/**
 * Minimal task shape the classifier needs. Deliberately not importing
 * the full Zod schema so this file has zero runtime dependencies.
 */
export interface ClassifiableTask {
  id: string;
  dueDate: string | null;
  priority: number;
}

/** Classify a single task into one of the four quadrants. */
export function classifyTask(
  task: ClassifiableTask,
  prefs: MatrixPrefs = DEFAULT_MATRIX_PREFS,
): Quadrant {
  const urgent = isUrgent(task.dueDate, prefs.urgencyDays);
  const important = isImportant(task.priority, prefs.importanceCutoff);
  if (urgent && important) return 'do';
  if (!urgent && important) return 'schedule';
  if (urgent && !important) return 'delegate';
  return 'eliminate';
}

/**
 * Partition an array of tasks into quadrant buckets.
 * Order within each bucket preserves the input order (typically
 * `order` ASC from the DB).
 */
export function classifyAll<T extends ClassifiableTask>(
  tasks: readonly T[],
  prefs: MatrixPrefs = DEFAULT_MATRIX_PREFS,
): Record<Quadrant, T[]> {
  const result: Record<Quadrant, T[]> = {
    do: [],
    schedule: [],
    delegate: [],
    eliminate: [],
  };
  for (const task of tasks) {
    result[classifyTask(task, prefs)].push(task);
  }
  return result;
}

// ── Private helpers ──────────────────────────────────────────────────────────

/**
 * A task is urgent when it has a due date that falls on or before
 * (today + urgencyDays) local time.
 */
function isUrgent(dueDate: string | null, urgencyDays: number): boolean {
  if (dueDate === null || dueDate === '') return false;
  const threshold = startOfDay(offsetDays(new Date(), urgencyDays));
  const due = parseDue(dueDate);
  if (due === null) return false;
  return startOfDay(due).getTime() <= threshold.getTime();
}

/** A task is important when its priority is at or above the cutoff. */
function isImportant(priority: number, cutoff: number): boolean {
  return priority <= cutoff;
}

function parseDue(value: string): Date | null {
  // Date-only strings must not be parsed as UTC (they'd shift in negative offsets).
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(value);
  if (dateOnly) {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    return new Date(y, m - 1, d);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function offsetDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}
