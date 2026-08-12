import { describe, expect, it } from 'vitest';
import { computePurgeCutoff } from './purge';

/**
 * Unit tests for the purge cutoff computation.
 *
 * The cutoff decides which trashed rows are permanently deleted, so the
 * arithmetic deserves explicit pinning: an off-by-one in the day math
 * would either purge data a day early (data loss) or leave it a day
 * late (harmless). These tests lock the exact boundary.
 */

describe('computePurgeCutoff', () => {
  const now = new Date('2026-08-12T10:00:00.000Z');

  it('subtracts exactly N days in UTC', () => {
    expect(computePurgeCutoff(now, 30)).toBe('2026-07-13T10:00:00.000Z');
  });

  it('handles a 1-day retention window', () => {
    expect(computePurgeCutoff(now, 1)).toBe('2026-08-11T10:00:00.000Z');
  });

  it('crosses a year boundary correctly', () => {
    expect(computePurgeCutoff(new Date('2026-01-05T00:00:00.000Z'), 10)).toBe(
      '2025-12-26T00:00:00.000Z',
    );
  });

  it('produces a cutoff that sorts lexicographically before "now"', () => {
    // The purge compares ISO strings with SQL `<` — the cutoff must be
    // in the same sortable format as stored deleted_at values.
    const cutoff = computePurgeCutoff(now, 7);
    expect(cutoff < now.toISOString()).toBe(true);
    expect(cutoff).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
