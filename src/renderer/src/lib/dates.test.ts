import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  formatDueDate,
  isOverdue,
  localDateString,
} from './dates';

/**
 * Tests pin the date logic against a fixed "today" via vi.useFakeTimers
 * so the relative-formatting branches don't drift over wall-clock time.
 */

const FIXED_NOW = new Date(2026, 4, 19, 10, 30, 0); // 2026-05-19 10:30 local

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('localDateString', () => {
  it('formats the current date when no arg is passed', () => {
    expect(localDateString()).toBe('2026-05-19');
  });

  it('zero-pads single-digit months and days', () => {
    expect(localDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('uses local time, not UTC', () => {
    // 2026-05-19 23:00 local → 2026-05-19, not 2026-05-20 even if the
    // machine is east of UTC where the UTC date would be the next day.
    expect(localDateString(new Date(2026, 4, 19, 23, 0))).toBe('2026-05-19');
  });
});

describe('addDays', () => {
  it('shifts forward', () => {
    expect(localDateString(addDays(FIXED_NOW, 1))).toBe('2026-05-20');
    expect(localDateString(addDays(FIXED_NOW, 7))).toBe('2026-05-26');
  });

  it('shifts backward', () => {
    expect(localDateString(addDays(FIXED_NOW, -1))).toBe('2026-05-18');
  });

  it('crosses month boundaries', () => {
    const may30 = new Date(2026, 4, 30);
    expect(localDateString(addDays(may30, 3))).toBe('2026-06-02');
  });

  it('does not mutate the input', () => {
    const original = new Date(FIXED_NOW);
    addDays(original, 5);
    expect(original.getTime()).toBe(FIXED_NOW.getTime());
  });
});

describe('formatDueDate', () => {
  it("returns '' for null/undefined/empty", () => {
    expect(formatDueDate(null)).toBe('');
    expect(formatDueDate(undefined)).toBe('');
    expect(formatDueDate('')).toBe('');
  });

  it("returns 'Today' for the current date", () => {
    expect(formatDueDate('2026-05-19')).toBe('Today');
  });

  it("returns 'Tomorrow' for tomorrow", () => {
    expect(formatDueDate('2026-05-20')).toBe('Tomorrow');
  });

  it("returns 'Yesterday' for yesterday", () => {
    expect(formatDueDate('2026-05-18')).toBe('Yesterday');
  });

  it("returns 'Overdue: …' for older dates", () => {
    expect(formatDueDate('2026-05-10')).toMatch(/^Overdue:/);
  });

  it('returns the weekday for the next 6 days', () => {
    // 2026-05-22 is a Friday; locale-dependent shortening is fine as
    // long as it's not the unwanted fallback formats.
    const result = formatDueDate('2026-05-22');
    expect(result).not.toBe('Today');
    expect(result).not.toBe('Tomorrow');
    expect(result).not.toContain('Overdue');
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it("returns 'MMM d' for dates further out in the same year", () => {
    // 2026-08-15 — should be roughly "Aug 15" in en-US.
    expect(formatDueDate('2026-08-15')).toMatch(/^[A-Za-z]{3} \d{1,2}$/);
  });

  it('handles a full ISO datetime by deriving its calendar day', () => {
    expect(formatDueDate('2026-05-19T15:00:00Z')).toBe('Today');
  });

  it("returns '' for a malformed date", () => {
    expect(formatDueDate('not-a-date')).toBe('');
  });

  it('uses local time to determine "today" for date-only strings', () => {
    // The date-only branch constructs a local-time Date from
    // components, so a date-only "today" never lands on yesterday
    // because of UTC parsing.
    expect(formatDueDate('2026-05-19')).toBe('Today');
  });
});

describe('isOverdue', () => {
  it('returns false for null/empty', () => {
    expect(isOverdue(null)).toBe(false);
    expect(isOverdue('')).toBe(false);
  });

  it('returns false for today', () => {
    expect(isOverdue('2026-05-19')).toBe(false);
  });

  it('returns false for future', () => {
    expect(isOverdue('2026-05-25')).toBe(false);
  });

  it('returns true for yesterday', () => {
    expect(isOverdue('2026-05-18')).toBe(true);
  });

  it('returns true for a past datetime', () => {
    expect(isOverdue('2026-05-18T09:00:00Z')).toBe(true);
  });
});
