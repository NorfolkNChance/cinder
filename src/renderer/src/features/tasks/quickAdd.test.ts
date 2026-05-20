import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseQuickAdd } from './quickAdd';

/**
 * Tests pin the parser against a fixed "now" so date-relative phrases
 * (tomorrow, next Monday) resolve to known values.
 */

const FIXED_NOW = new Date(2026, 4, 19, 10, 0, 0); // Tue 2026-05-19 10:00 local

const PROJECTS = [
  { id: 'p-work', name: 'Work' },
  { id: 'p-personal', name: 'Personal' },
];

const LABELS = [
  { id: 'l-urgent', name: 'urgent' },
  { id: 'l-followup', name: 'followup' },
  { id: 'l-bug', name: 'bug' },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function parse(input: string) {
  return parseQuickAdd(input, {
    projects: PROJECTS,
    labels: LABELS,
    now: FIXED_NOW,
  });
}

describe('parseQuickAdd — basic cases', () => {
  it('returns the input as title when nothing matches', () => {
    const result = parse('buy milk');
    expect(result).toMatchObject({
      title: 'buy milk',
      dueDate: null,
      priority: null,
      projectId: null,
      matches: [],
    });
  });

  it('returns an empty title for empty input', () => {
    const result = parse('');
    expect(result.title).toBe('');
    expect(result.dueDate).toBeNull();
    expect(result.priority).toBeNull();
    expect(result.projectId).toBeNull();
  });

  it('collapses whitespace left after stripping tokens', () => {
    const result = parse('do   the   thing');
    expect(result.title).toBe('do the thing');
  });
});

describe('parseQuickAdd — priority', () => {
  it('matches p1 through p4 (lowercase)', () => {
    for (let i = 1 as 1 | 2 | 3 | 4; i <= 4; i = (i + 1) as 1 | 2 | 3 | 4) {
      const r = parse(`task p${i}`);
      expect(r.priority).toBe(i);
      expect(r.title).toBe('task');
    }
  });

  it('matches uppercase P1', () => {
    expect(parse('task P1').priority).toBe(1);
  });

  it('the last priority wins when there are several', () => {
    expect(parse('task p3 then p1').priority).toBe(1);
    expect(parse('task p3 then p1').title).toBe('task then');
  });

  it('does not match priority embedded in a word', () => {
    // "step1" must not be parsed as priority 1.
    const r = parse('step1');
    expect(r.priority).toBeNull();
    expect(r.title).toBe('step1');
  });

  it('does not match priorities outside 1-4', () => {
    expect(parse('p5').priority).toBeNull();
    expect(parse('p0').priority).toBeNull();
  });
});

describe('parseQuickAdd — project', () => {
  it('resolves a known project tag (case-insensitive)', () => {
    expect(parse('plan things #work').projectId).toBe('p-work');
    expect(parse('plan things #Work').projectId).toBe('p-work');
    expect(parse('plan things #WORK').projectId).toBe('p-work');
  });

  it('strips the project tag from the title', () => {
    expect(parse('plan things #work').title).toBe('plan things');
  });

  it('leaves unknown project tags in the title verbatim', () => {
    // Forgiveness: user mistypes, sees the # still in their input, fixes it.
    const r = parse('plan things #unknownproject');
    expect(r.projectId).toBeNull();
    expect(r.title).toBe('plan things #unknownproject');
  });

  it('first known tag wins; later tags (known or not) stay in title', () => {
    const r = parse('do it #work #personal');
    expect(r.projectId).toBe('p-work');
    // #personal stays in the title because #work already won the slot.
    expect(r.title).toBe('do it #personal');
  });
});

describe('parseQuickAdd — date', () => {
  it('parses "tomorrow" as a date-only string', () => {
    const r = parse('buy milk tomorrow');
    expect(r.dueDate).toBe('2026-05-20');
    expect(r.title).toBe('buy milk');
  });

  it('parses "today" as a date-only string', () => {
    expect(parse('clean desk today').dueDate).toBe('2026-05-19');
  });

  it('parses "tomorrow at 5pm" as a full ISO datetime', () => {
    const r = parse('submit report tomorrow at 5pm');
    expect(r.dueDate).not.toBeNull();
    // The datetime form includes a T separator
    expect(r.dueDate).toMatch(/T/);
    expect(r.title).toBe('submit report');
  });

  it('first chrono match wins when multiple date phrases appear', () => {
    // "tomorrow about the Tuesday meeting" — only the first should be
    // consumed as the due date.
    const r = parse('remind tomorrow about Tuesday meeting');
    // First match is "tomorrow", date-only
    expect(r.dueDate).toBe('2026-05-20');
    // The title still has 'Tuesday meeting' — second match wasn't stripped
    expect(r.title).toContain('Tuesday meeting');
  });

  it('returns null dueDate when no date phrase is present', () => {
    expect(parse('write the thing').dueDate).toBeNull();
  });
});

describe('parseQuickAdd — combined', () => {
  it('parses the architecture example', () => {
    // From ARCHITECTURE.md §6.2:
    // "Submit report tomorrow at 5pm p1 #work" (we use Work since labels
    // are deferred to Phase 3).
    const r = parse('Submit report tomorrow at 5pm p1 #work');
    expect(r.title).toBe('Submit report');
    expect(r.priority).toBe(1);
    expect(r.projectId).toBe('p-work');
    expect(r.dueDate).not.toBeNull();
    expect(r.dueDate).toMatch(/T/); // has time component
  });

  it('produces matches in input order', () => {
    const r = parse('Do it tomorrow p1 #work');
    const positions = r.matches.map((m) => m.start);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });

  it('matches include the original text spans', () => {
    const input = 'plan tomorrow p2 #work';
    const r = parse(input);
    for (const m of r.matches) {
      expect(input.slice(m.start, m.end)).toBe(m.text);
    }
  });
});

describe('parseQuickAdd — recurrence', () => {
  it('recognises "daily" and sets recurrence + default first-due', () => {
    const r = parse('exercise daily');
    expect(r.recurrence).not.toBeNull();
    expect(r.recurrence).toContain('FREQ=DAILY');
    expect(r.title).toBe('exercise');
    // First occurrence defaults to today (anchored at `now`).
    expect(r.dueDate).toBe('2026-05-19');
  });

  it('recognises "every monday"', () => {
    const r = parse('standup every monday');
    expect(r.recurrence).toContain('FREQ=WEEKLY');
    expect(r.recurrence).toContain('BYDAY=MO');
    expect(r.title).toBe('standup');
    // Anchored Tue 5/19, next Monday is 5/25.
    expect(r.dueDate).toBe('2026-05-25');
  });

  it('recognises "every 2 weeks"', () => {
    const r = parse('1-on-1 every 2 weeks');
    expect(r.recurrence).toContain('FREQ=WEEKLY');
    expect(r.recurrence).toContain('INTERVAL=2');
    expect(r.title).toBe('1-on-1');
  });

  it('"every monday" should NOT also be claimed by chrono as a one-off date', () => {
    // Pre-fix this test would surface as a bug: chrono would parse
    // "monday" as a one-off date, the recurrence phrase would still
    // be claimed too, and the title would lose "monday" twice in
    // weird ways. We mask the recurrence span before running chrono.
    const r = parse('standup every monday p1');
    // Title is just "standup" + the priority is stripped.
    expect(r.title).toBe('standup');
    expect(r.priority).toBe(1);
  });

  it('strips the recurrence span from the title', () => {
    const r = parse('drink water every day');
    expect(r.title).toBe('drink water');
  });

  it('keeps an explicit date next to a recurrence (date wins for dueDate)', () => {
    // The user wrote both: "tomorrow" + "every week" — we honour the
    // explicit one-off date, not the first-occurrence default.
    const r = parse('water plants tomorrow every week');
    expect(r.dueDate).toBe('2026-05-20'); // chrono's "tomorrow"
    expect(r.recurrence).toContain('FREQ=WEEKLY');
    expect(r.title).toBe('water plants');
  });
});

describe('parseQuickAdd — labels', () => {
  it('resolves a known @label (case-insensitive)', () => {
    const r = parse('triage @urgent');
    expect(r.labelIds).toEqual(['l-urgent']);
    expect(r.title).toBe('triage');
  });

  it('attaches multiple distinct labels', () => {
    const r = parse('triage @urgent @bug');
    expect(r.labelIds).toEqual(['l-urgent', 'l-bug']);
    expect(r.title).toBe('triage');
  });

  it('dedups duplicate label references but strips the duplicate tag', () => {
    const r = parse('triage @urgent @URGENT');
    expect(r.labelIds).toEqual(['l-urgent']);
    expect(r.title).toBe('triage');
  });

  it('leaves unknown @tags in the title verbatim', () => {
    const r = parse('email @sarah about it');
    expect(r.labelIds).toEqual([]);
    expect(r.title).toContain('@sarah');
  });

  it('combines labels with project + date + priority', () => {
    const r = parse('Fix bug tomorrow p1 #work @urgent @bug');
    expect(r.title).toBe('Fix bug');
    expect(r.priority).toBe(1);
    expect(r.projectId).toBe('p-work');
    expect(r.labelIds).toEqual(['l-urgent', 'l-bug']);
    expect(r.dueDate).toBe('2026-05-20');
  });
});

describe('parseQuickAdd — adversarial inputs', () => {
  it('only-priority input → empty title + priority', () => {
    const r = parse('p1');
    expect(r.title).toBe('');
    expect(r.priority).toBe(1);
  });

  it('only-project input → empty title + projectId', () => {
    const r = parse('#work');
    expect(r.title).toBe('');
    expect(r.projectId).toBe('p-work');
  });

  it("returns title without leading/trailing whitespace after stripping", () => {
    const r = parse('  p1  buy   milk  ');
    expect(r.title).toBe('buy milk');
  });
});
