import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeFirstOccurrence,
  computeNextOccurrence,
  describeRecurrence,
  naturalToRrule,
} from './index';

const FIXED_NOW = new Date(2026, 4, 19, 10, 0, 0); // Tue 2026-05-19 10:00 local

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('naturalToRrule', () => {
  it('maps single-word keywords', () => {
    expect(naturalToRrule('daily')).toContain('FREQ=DAILY');
    expect(naturalToRrule('weekly')).toContain('FREQ=WEEKLY');
    expect(naturalToRrule('monthly')).toContain('FREQ=MONTHLY');
    expect(naturalToRrule('yearly')).toContain('FREQ=YEARLY');
  });

  it('handles "every day", "every week", etc', () => {
    expect(naturalToRrule('every day')).toContain('FREQ=DAILY');
    expect(naturalToRrule('every week')).toContain('FREQ=WEEKLY');
    expect(naturalToRrule('every month')).toContain('FREQ=MONTHLY');
  });

  it('handles "every monday" → weekly on monday', () => {
    const rrule = naturalToRrule('every monday');
    expect(rrule).toContain('FREQ=WEEKLY');
    expect(rrule).toContain('BYDAY=MO');
  });

  it('handles "every 2 weeks" → INTERVAL=2', () => {
    const rrule = naturalToRrule('every 2 weeks');
    expect(rrule).toContain('FREQ=WEEKLY');
    expect(rrule).toContain('INTERVAL=2');
  });

  it('returns null for garbage', () => {
    expect(naturalToRrule('asdfasdf')).toBeNull();
    expect(naturalToRrule('')).toBeNull();
  });
});

describe('computeNextOccurrence — date-only inputs', () => {
  const DAILY = 'RRULE:FREQ=DAILY';
  const WEEKLY = 'RRULE:FREQ=WEEKLY';

  it('advances DAILY by one day', () => {
    expect(computeNextOccurrence(DAILY, '2026-05-19')).toBe('2026-05-20');
  });

  it('advances WEEKLY by 7 days', () => {
    expect(computeNextOccurrence(WEEKLY, '2026-05-19')).toBe('2026-05-26');
  });

  it('handles INTERVAL=2 on weekly', () => {
    const r = 'RRULE:FREQ=WEEKLY;INTERVAL=2';
    expect(computeNextOccurrence(r, '2026-05-19')).toBe('2026-06-02');
  });

  it('handles BYDAY for "every monday" anchored on a Monday', () => {
    // Anchored on Mon 2026-05-18, every Monday: next occurrence is
    // Mon 2026-05-25. (Production tasks reach this state because
    // computeFirstOccurrence already aligns the initial due-date to a
    // BYDAY-valid weekday, and subsequent advances preserve that
    // alignment.)
    const r = 'RRULE:FREQ=WEEKLY;BYDAY=MO';
    expect(computeNextOccurrence(r, '2026-05-18')).toBe('2026-05-25');
  });

  it('preserves date-only form (no T separator)', () => {
    const r = computeNextOccurrence(DAILY, '2026-05-19');
    expect(r).not.toContain('T');
  });

  it('returns null when the rule has no next occurrence', () => {
    // COUNT=1 means only the dtstart fires; after that there's nothing.
    const r = 'RRULE:FREQ=DAILY;COUNT=1';
    expect(computeNextOccurrence(r, '2026-05-19')).toBeNull();
  });

  it('returns null for a malformed rule', () => {
    expect(computeNextOccurrence('garbage', '2026-05-19')).toBeNull();
  });

  it('returns null for a malformed currentDue', () => {
    expect(computeNextOccurrence('RRULE:FREQ=DAILY', 'nope')).toBeNull();
  });
});

describe('computeNextOccurrence — datetime inputs', () => {
  it('preserves the datetime form (T separator + offset)', () => {
    const r = computeNextOccurrence(
      'RRULE:FREQ=DAILY',
      '2026-05-19T10:00:00.000Z',
    );
    expect(r).not.toBeNull();
    expect(r).toContain('T');
  });

  it('advances the date by the FREQ amount', () => {
    const r = computeNextOccurrence(
      'RRULE:FREQ=WEEKLY',
      '2026-05-19T10:00:00.000Z',
    );
    expect(r).not.toBeNull();
    // 7 days after May 19 is May 26.
    expect(r!.startsWith('2026-05-26')).toBe(true);
  });
});

describe('computeFirstOccurrence', () => {
  it('returns today when daily is anchored today', () => {
    expect(computeFirstOccurrence('RRULE:FREQ=DAILY', FIXED_NOW)).toBe(
      '2026-05-19',
    );
  });

  it('returns the next Monday for "every monday" anchored Tuesday', () => {
    const rrule = naturalToRrule('every monday');
    expect(rrule).not.toBeNull();
    expect(computeFirstOccurrence(rrule!, FIXED_NOW)).toBe('2026-05-25');
  });
});

describe('describeRecurrence', () => {
  it('produces a short readable label', () => {
    expect(describeRecurrence('RRULE:FREQ=DAILY')).toMatch(/^Every day|^Daily/i);
    expect(describeRecurrence('RRULE:FREQ=WEEKLY')).toMatch(/week/i);
  });

  it('falls back to "Repeats" on unparseable input', () => {
    expect(describeRecurrence('garbage')).toBe('Repeats');
  });
});
