import * as chrono from 'chrono-node';
import {
  computeFirstOccurrence,
  naturalToRrule,
} from '../../../../shared/recurrence';

/**
 * Quick-add NLP parser.
 *
 * Takes a free-text input string (e.g. "Submit report tomorrow at 5pm p1
 * #work") and extracts task properties from it, returning what's left as
 * the title. Matched tokens are stripped from the title; unrecognised
 * tokens (e.g. `#unknownproject`) are deliberately left in place so the
 * user notices their typo rather than silently losing the tag.
 *
 * Recognised syntax (§6.2):
 *   - Natural-language date phrases  (chrono-node) → dueDate
 *   - `p1`, `p2`, `p3`, `p4` (case-insensitive, word-bounded) → priority
 *   - `#projectname` (word characters, no spaces) → projectId
 *
 * `@labelname` is part of the v1 syntax (§6.2) but labels are Phase 3 —
 * this parser does NOT currently consume @tags, so they remain in the
 * title for now. When labels land, extend `recogniseLabels` analogously
 * to `recogniseProjects`.
 *
 * Multiple matches of the same kind:
 *   - Date: chrono's first match wins; subsequent date phrases stay in
 *     the title verbatim. Avoids surprising the user when they write
 *     "remind me tomorrow about the Tuesday meeting".
 *   - Priority: the LAST `pN` token wins. Common edit pattern — type
 *     p3, change mind, type p1; the most recent one is intent.
 *   - Project: the FIRST `#tag` that matches a known project wins.
 *     Subsequent #tags stay in the title.
 *
 * Project name matching is case-insensitive exact (not fuzzy). Keeps
 * the behaviour predictable; users learn their project shortcuts.
 */

export interface QuickAddContext {
  /** Projects available for `#tag` resolution. Only id + name needed. */
  readonly projects: readonly { id: string; name: string }[];
  /** Reference "now" for chrono — defaults to new Date(). Test injection. */
  readonly now?: Date;
}

export interface ParsedQuickAdd {
  /** Title after stripping all matched tokens. May be empty. */
  readonly title: string;
  /** ISO-8601 string (date or datetime) or null. */
  readonly dueDate: string | null;
  /** 1-4 or null. */
  readonly priority: 1 | 2 | 3 | 4 | null;
  /** Resolved project id or null. */
  readonly projectId: string | null;
  /** RFC 5545 RRULE string or null. */
  readonly recurrence: string | null;
  /** Matched spans into the *original* input, in input order. For UI highlight. */
  readonly matches: readonly Match[];
}

export interface Match {
  readonly type: 'date' | 'priority' | 'project' | 'recurrence';
  readonly text: string;
  /** Start offset (inclusive) into the original input. */
  readonly start: number;
  /** End offset (exclusive). */
  readonly end: number;
}

/** Public entry point. Pure — no side effects, deterministic given inputs + now. */
export function parseQuickAdd(
  input: string,
  ctx: QuickAddContext,
): ParsedQuickAdd {
  const now = ctx.now ?? new Date();
  const matches: Match[] = [];

  // ── Priority — last wins ────────────────────────────────────────────────
  const priorityMatches = [...input.matchAll(/\b[pP]([1-4])\b/g)];
  let priority: 1 | 2 | 3 | 4 | null = null;
  for (const m of priorityMatches) {
    if (m.index === undefined) continue;
    priority = Number(m[1]) as 1 | 2 | 3 | 4;
    matches.push({
      type: 'priority',
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  // ── Project — first matching tag wins; others stay in the title ────────
  const projectTagMatches = [...input.matchAll(/#(\w+)/g)];
  let projectId: string | null = null;
  for (const m of projectTagMatches) {
    if (m.index === undefined) continue;
    const tag = (m[1] ?? '').toLowerCase();
    const project = ctx.projects.find((p) => p.name.toLowerCase() === tag);
    if (project === undefined) continue;
    if (projectId !== null) {
      // We already matched a project — leave this tag in the title.
      continue;
    }
    projectId = project.id;
    matches.push({
      type: 'project',
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  // ── Recurrence — must run BEFORE chrono so phrases like "every monday"
  //    aren't first claimed as a one-off date by chrono. The match is then
  //    excised from the string we feed to chrono so the priority/project
  //    matches don't have to compete with chrono's leftover indices.
  const recurrenceMatch = recogniseRecurrence(input);
  let recurrence: string | null = null;
  let chronoInput = input;
  if (recurrenceMatch !== null) {
    recurrence = recurrenceMatch.rrule;
    matches.push({
      type: 'recurrence',
      text: recurrenceMatch.text,
      start: recurrenceMatch.start,
      end: recurrenceMatch.end,
    });
    // Replace the recurrence phrase with spaces (same length) so chrono's
    // indices below still line up against the original input string.
    chronoInput =
      input.slice(0, recurrenceMatch.start) +
      ' '.repeat(recurrenceMatch.end - recurrenceMatch.start) +
      input.slice(recurrenceMatch.end);
  }

  // ── Date — chrono-node, first match wins ───────────────────────────────
  let dueDate: string | null = null;
  const chronoResults = chrono.parse(chronoInput, now, { forwardDate: true });
  const firstChrono = chronoResults[0];
  if (firstChrono !== undefined) {
    const date = firstChrono.start.date();
    // If the parsed phrase mentioned a time component, store as full ISO
    // datetime; otherwise store as date-only YYYY-MM-DD. The renderer's
    // dueDate display handles both forms.
    const hasTime =
      firstChrono.start.isCertain('hour') ||
      firstChrono.start.isCertain('minute');
    dueDate = hasTime ? date.toISOString() : isoDateOnly(date);
    matches.push({
      type: 'date',
      text: firstChrono.text,
      start: firstChrono.index,
      end: firstChrono.index + firstChrono.text.length,
    });
  }

  // ── Strip matches from the title ───────────────────────────────────────
  // Sort matches by start offset and remove each span from the input.
  // Walking in reverse means later removals don't shift earlier indices.
  const sortedDesc = [...matches].sort((a, b) => b.start - a.start);
  let titleBuf = input;
  for (const m of sortedDesc) {
    titleBuf = titleBuf.slice(0, m.start) + titleBuf.slice(m.end);
  }
  const title = collapseWhitespace(titleBuf);

  // If we recognised a recurrence but the user didn't also give us an
  // explicit date, anchor the first occurrence at "today" so the task
  // surfaces somewhere — otherwise it would be invisible until edited.
  let finalDueDate = dueDate;
  if (recurrence !== null && finalDueDate === null) {
    finalDueDate = computeFirstOccurrence(recurrence, now);
  }

  return {
    title,
    dueDate: finalDueDate,
    priority,
    projectId,
    recurrence,
    matches: matches.sort((a, b) => a.start - b.start),
  };
}

/**
 * Recognise a natural-language recurrence phrase in the input.
 *
 * Two strategies:
 *   1. Short keywords: `daily | weekly | monthly | yearly | annually`
 *      — instantly map to their canonical RRULEs.
 *   2. "every X" phrases — capture the phrase, hand it to rrule's
 *      `fromText` natural-language parser, accept if a valid FREQ is
 *      produced.
 *
 * Returns null if nothing useful is found. First successful match wins.
 */
function recogniseRecurrence(input: string): {
  text: string;
  start: number;
  end: number;
  rrule: string;
} | null {
  // 1. Single-word keywords.
  const simple = /\b(daily|weekly|monthly|yearly|annually)\b/i.exec(input);
  if (simple !== null && simple.index !== undefined) {
    const rrule = naturalToRrule(simple[0]);
    if (rrule !== null) {
      return {
        text: simple[0],
        start: simple.index,
        end: simple.index + simple[0].length,
        rrule,
      };
    }
  }

  // 2. "every X" phrases. We capture a generous span — up to four words
  //    after "every" — and let rrule.fromText decide if it's coherent.
  //    The greedy pattern handles "every 2 weeks on monday" cleanly.
  const every = /\bevery(?:\s+\w+){1,4}\b/i.exec(input);
  if (every !== null && every.index !== undefined) {
    const rrule = naturalToRrule(every[0]);
    if (rrule !== null) {
      return {
        text: every[0],
        start: every.index,
        end: every.index + every[0].length,
        rrule,
      };
    }
  }

  return null;
}

function isoDateOnly(d: Date): string {
  // Local-time date — quick-add uses the user's "today", not UTC's.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
