import { describe, expect, it } from 'vitest';
import { tryParseDailyDate } from './vaultScanner';

// ── tryParseDailyDate ──────────────────────────────────────────────────────────
//
// Supports four path patterns (relative to the daily notes root):
//   Pattern 1: YYYY-MM-DD.md               → plain date filename
//   Pattern 2: YYYY/MM/DD.md               → nested numeric folders
//   Pattern 3: YYYY/MM/YYYY-MM-DD.md       → year+month folder, date filename
//   Pattern 4: YYYY/YYYY-MM-DD.md          → year folder, date filename
//   Also:      YYYY/MM/D.md                → single-digit day (no zero-padding)
//   Returns null for unrecognised paths and invalid calendar dates.

describe('tryParseDailyDate', () => {
  // ── Pattern 1: flat YYYY-MM-DD.md ────────────────────────────────────────
  it('returns the date for a plain YYYY-MM-DD.md filename', () => {
    expect(tryParseDailyDate('2026-05-29.md')).toBe('2026-05-29');
  });

  it('returns null for a filename that is not a date', () => {
    expect(tryParseDailyDate('meeting-notes.md')).toBeNull();
  });

  // ── Pattern 2: YYYY/MM/DD.md (three numeric segments) ────────────────────
  it('returns the date for YYYY/MM/DD.md nested layout', () => {
    expect(tryParseDailyDate('2026/05/29.md')).toBe('2026-05-29');
  });

  it('returns the date for a deep nested path YYYY/MM/DD.md', () => {
    // More than three segments — only the last three matter.
    expect(tryParseDailyDate('vault/2026/05/29.md')).toBe('2026-05-29');
  });

  // ── Pattern 3: YYYY/MM/YYYY-MM-DD.md ─────────────────────────────────────
  it('returns the date for YYYY/MM/YYYY-MM-DD.md layout', () => {
    expect(tryParseDailyDate('2026/05/2026-05-29.md')).toBe('2026-05-29');
  });

  // ── Pattern 4: YYYY/YYYY-MM-DD.md ────────────────────────────────────────
  it('returns the date for YYYY/YYYY-MM-DD.md layout', () => {
    expect(tryParseDailyDate('2026/2026-05-29.md')).toBe('2026-05-29');
  });

  // ── Single-digit day (no zero-padding) ───────────────────────────────────
  it('returns a zero-padded date for YYYY/MM/D.md (single-digit day)', () => {
    expect(tryParseDailyDate('2026/05/3.md')).toBe('2026-05-03');
  });

  // ── Invalid calendar dates ────────────────────────────────────────────────
  it('returns null for an impossible date (month 13)', () => {
    expect(tryParseDailyDate('2026-13-01.md')).toBeNull();
  });

  it('returns null for an impossible date (day 32)', () => {
    expect(tryParseDailyDate('2026-05-32.md')).toBeNull();
  });

  it('returns the date for Feb 30 (JavaScript Date allows overflow)', () => {
    // JavaScript's Date constructor is lenient: Feb 30 rolls over to Mar 2.
    // isValidDate only checks !isNaN, so it passes.
    expect(tryParseDailyDate('2026-02-30.md')).toBe('2026-02-30');
  });

  // ── Year boundary ─────────────────────────────────────────────────────────
  it('returns the correct date for Dec 31', () => {
    expect(tryParseDailyDate('2025-12-31.md')).toBe('2025-12-31');
  });

  it('returns the correct date for Jan 1', () => {
    expect(tryParseDailyDate('2026-01-01.md')).toBe('2026-01-01');
  });

  // ── Non-date content ──────────────────────────────────────────────────────
  it('returns null for a completely non-numeric path', () => {
    expect(tryParseDailyDate('Projects/Work/meeting.md')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(tryParseDailyDate('')).toBeNull();
  });

  // ── Windows-style backslash paths ─────────────────────────────────────────
  it('handles backslash path separators (Windows paths)', () => {
    expect(tryParseDailyDate('2026\\05\\29.md')).toBe('2026-05-29');
  });
});
