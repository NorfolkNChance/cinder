import { RRule } from 'rrule';

/**
 * Recurrence helpers around the RFC 5545 `RRULE` format.
 *
 * The task schema stores `due_recurrence` as an RRULE string (e.g.
 * "RRULE:FREQ=WEEKLY;BYDAY=MO"). When a recurring task is "completed"
 * we don't stamp completed_at — we advance its `due_date` to the next
 * occurrence. The same row keeps rolling forward until the rule has no
 * more occurrences, at which point completion behaves normally.
 *
 * Date handling
 *   - `due_date` may be date-only ("2026-05-19") OR full ISO datetime
 *     ("2026-05-19T17:00:00Z"). `computeNextOccurrence` preserves
 *     whichever form was passed in so the round-trip is form-stable.
 *   - Time-zone semantics: date-only values are interpreted in local
 *     time (the user's "today"); datetimes use whatever offset they
 *     carry. rrule itself works in floating local time when its
 *     dtstart has no tz info — which matches our inputs.
 */

/**
 * Compute the next due-date after `currentDueIso` according to the
 * recurrence rule. Returns null if the rule has no further occurrences.
 *
 * The output preserves the input's date-vs-datetime form: a date-only
 * input produces a date-only output, a datetime input produces a
 * datetime output. The actual time-of-day is taken from the input
 * (datetime inputs) or defaulted to local midnight (date inputs).
 */
export function computeNextOccurrence(
  rruleStr: string,
  currentDueIso: string,
): string | null {
  const dateOnly = isDateOnly(currentDueIso);

  const dtstart = dateOnly
    ? parseLocalDateOnly(currentDueIso)
    : new Date(currentDueIso);
  if (Number.isNaN(dtstart.getTime())) return null;

  const rule = buildRule(rruleStr, dtstart);
  if (rule === null) return null;

  // `.after(date, inclusive=false)` returns the next occurrence STRICTLY
  // after `date`. dtstart itself is the current due — we want the one
  // after it.
  const next = rule.after(dtstart, false);
  if (next === null) return null;

  return dateOnly ? formatLocalDateOnly(next) : next.toISOString();
}

/**
 * Compute the first occurrence of the rule on or after `from`. Used
 * when a recurrence is set on a task that doesn't yet have a due date
 * — we infer the first date from the rule itself.
 *
 * Returns null if the rule never fires (rare with sensible inputs).
 */
export function computeFirstOccurrence(
  rruleStr: string,
  from: Date = new Date(),
): string | null {
  const rule = buildRule(rruleStr, from);
  if (rule === null) return null;
  // inclusive=true so a daily-rule anchored today fires today, not
  // tomorrow.
  const next = rule.after(from, true);
  if (next === null) return null;
  return formatLocalDateOnly(next);
}

/**
 * Hand-mapped RRULEs for single-word keywords. rrule's `fromText` only
 * accepts the "every X" form, so we shortcut these here.
 */
const SHORT_KEYWORD_RRULES: Readonly<Record<string, string>> = {
  daily: 'RRULE:FREQ=DAILY',
  weekly: 'RRULE:FREQ=WEEKLY',
  monthly: 'RRULE:FREQ=MONTHLY',
  yearly: 'RRULE:FREQ=YEARLY',
  annually: 'RRULE:FREQ=YEARLY',
};

/**
 * Try to interpret a natural-language phrase as an RRULE. Returns null
 * if the parse fails or the resulting rule looks degenerate (no
 * recognisable frequency).
 *
 * Examples that parse:
 *   "every day", "daily", "every weekday", "every monday",
 *   "every 2 weeks", "monthly", "yearly"
 */
export function naturalToRrule(phrase: string): string | null {
  const trimmed = phrase.trim();
  if (trimmed.length === 0) return null;

  const lower = trimmed.toLowerCase();
  if (lower in SHORT_KEYWORD_RRULES) {
    return SHORT_KEYWORD_RRULES[lower]!;
  }

  try {
    const rule = RRule.fromText(trimmed);
    if (rule.options.freq === undefined || rule.options.freq === null) {
      return null;
    }
    const out = rule.toString();
    // RRule occasionally returns an empty-string serialisation when it
    // accepted the text but couldn't pin down a frequency. Treat that
    // as a parse failure rather than producing an unusable RRULE.
    if (out === '' || !out.includes('FREQ=')) return null;
    return out;
  } catch {
    return null;
  }
}

/**
 * Best-effort short label for a stored RRULE. Used by the task row to
 * show "Daily", "Weekly", etc. next to the recurring-task icon.
 * Falls back to "Repeats" when the rule defies a clean short label.
 */
export function describeRecurrence(rruleStr: string): string {
  try {
    const opts = RRule.parseString(rruleStr);
    const rule = new RRule(opts);
    const text = rule.toText();
    // Capitalise the first letter for display ("every week" → "Every week").
    return text.charAt(0).toUpperCase() + text.slice(1);
  } catch {
    return 'Repeats';
  }
}

/**
 * Build an RRule object from a stored rule string anchored at `dtstart`.
 * Uses parseString + the explicit constructor (rather than the
 * `rrulestr` shorthand) so the dtstart override is honoured reliably
 * across rrule versions.
 */
function buildRule(rruleStr: string, dtstart: Date): RRule | null {
  try {
    const opts = RRule.parseString(rruleStr);
    // RRule's "tzid" defaults to undefined → floating local time, which
    // is what we want for date-only and naive-datetime inputs.
    return new RRule({ ...opts, dtstart });
  } catch {
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isDateOnly(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso);
}

/**
 * Anchor a date-only string at UTC noon, NOT local midnight.
 *
 * Why: rrule uses UTC weekdays for BYDAY comparisons. A local-midnight
 * Date can shift to the previous-day UTC under DST or positive
 * offsets (e.g. midnight BST → 23:00 UTC the day before), and
 * BYDAY=MO would then mis-fire as if the rule were "every Tuesday".
 *
 * UTC noon is timezone-neutral — any reasonable offset keeps it on
 * the same calendar day in both local and UTC clocks.
 */
function parseLocalDateOnly(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m === null) return new Date(NaN);
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0),
  );
}

function formatLocalDateOnly(d: Date): string {
  // Read UTC components for symmetry with parseLocalDateOnly's UTC anchor.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
