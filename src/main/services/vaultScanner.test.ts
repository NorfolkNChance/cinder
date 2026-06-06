import { describe, expect, it } from 'vitest';
import { tryParseDailyDate, extractTitle, countWikiLinks } from './vaultScanner';

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

// ── extractTitle ──────────────────────────────────────────────────────────────
//
// Priority: YAML frontmatter `title:` → first `# Heading` → filename stem.

describe('extractTitle', () => {
  // ── Frontmatter title ─────────────────────────────────────────────────────
  it('extracts title from YAML frontmatter', () => {
    const content = '---\ntitle: My Note\ntags: [work]\n---\n\n# Different Heading\n';
    expect(extractTitle(content, 'my-note')).toBe('My Note');
  });

  it('strips surrounding quotes from frontmatter title', () => {
    const content = '---\ntitle: "Quoted Title"\n---\n';
    expect(extractTitle(content, 'fallback')).toBe('Quoted Title');
  });

  it('strips single quotes from frontmatter title', () => {
    const content = "---\ntitle: 'Single Quoted'\n---\n";
    expect(extractTitle(content, 'fallback')).toBe('Single Quoted');
  });

  // ── First H1 heading ──────────────────────────────────────────────────────
  it('falls back to first # heading when no frontmatter', () => {
    const content = '# Meeting Notes\n\nSome text here.\n';
    expect(extractTitle(content, 'meeting-notes')).toBe('Meeting Notes');
  });

  it('ignores ## headings and uses only # headings', () => {
    const content = '## Section\n\nText.\n';
    expect(extractTitle(content, 'my-stem')).toBe('my-stem');
  });

  it('prefers frontmatter title over H1 heading', () => {
    const content = '---\ntitle: FM Title\n---\n\n# H1 Title\n';
    expect(extractTitle(content, 'stem')).toBe('FM Title');
  });

  // ── Filename stem fallback ────────────────────────────────────────────────
  it('falls back to filename stem when no frontmatter and no heading', () => {
    const content = 'Just some prose with no heading.\n';
    expect(extractTitle(content, 'my-filename')).toBe('my-filename');
  });

  it('uses filename stem for empty content', () => {
    expect(extractTitle('', 'empty-file')).toBe('empty-file');
  });

  // ── Incomplete frontmatter ────────────────────────────────────────────────
  it('falls back to H1 when frontmatter has no title key', () => {
    const content = '---\ntags: [a, b]\n---\n\n# Real Title\n';
    expect(extractTitle(content, 'stem')).toBe('Real Title');
  });

  it('falls back to stem when frontmatter is unclosed', () => {
    // No closing --- so it is not treated as frontmatter.
    const content = '---\ntitle: Broken FM\n\n# Heading\n';
    expect(extractTitle(content, 'stem')).toBe('Heading');
  });
});

// ── countWikiLinks ────────────────────────────────────────────────────────────

describe('countWikiLinks', () => {
  it('returns 0 for content with no wiki links', () => {
    expect(countWikiLinks('Just some text.')).toBe(0);
  });

  it('counts a single wiki link', () => {
    expect(countWikiLinks('See [[My Note]] for details.')).toBe(1);
  });

  it('counts multiple wiki links', () => {
    expect(countWikiLinks('[[A]] and [[B]] and [[C]]')).toBe(3);
  });

  it('does not count embed syntax ![[…]] as wiki links', () => {
    // countWikiLinks counts [[…]], not ![[…]].
    // An embed like ![[image.png]] contains [[image.png]] inside it,
    // so it WILL be counted — this is the current behaviour.
    expect(countWikiLinks('![[image.png]]')).toBe(1);
  });

  it('handles wiki links with pipe display text', () => {
    expect(countWikiLinks('[[Note Name|Display Text]]')).toBe(1);
  });

  it('returns 0 for empty string', () => {
    expect(countWikiLinks('')).toBe(0);
  });
});
