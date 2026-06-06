import { describe, expect, it } from 'vitest';
import { applyWikiLinks, buildTitle } from './vaultImporter';

// ── applyWikiLinks ────────────────────────────────────────────────────────────
//
// 'leave-as-is' → body unchanged.
// 'plain-text'  → [[Target]] → "Target", [[Target|Display]] → "Display".

describe('applyWikiLinks', () => {
  // ── leave-as-is strategy ──────────────────────────────────────────────────
  it('returns body unchanged for leave-as-is strategy', () => {
    const body = 'See [[My Note]] for more.';
    expect(applyWikiLinks(body, 'leave-as-is')).toBe(body);
  });

  // ── plain-text strategy ───────────────────────────────────────────────────
  it('converts [[Target]] to plain target text', () => {
    expect(applyWikiLinks('See [[My Note]] here.', 'plain-text')).toBe(
      'See My Note here.',
    );
  });

  it('uses display text when [[Target|Display]] syntax is present', () => {
    expect(applyWikiLinks('Read [[Note Name|this article]].', 'plain-text')).toBe(
      'Read this article.',
    );
  });

  it('converts multiple wiki links in one pass', () => {
    expect(
      applyWikiLinks('[[A]] and [[B|bee]] and [[C]].', 'plain-text'),
    ).toBe('A and bee and C.');
  });

  it('trims whitespace from target and display text', () => {
    expect(applyWikiLinks('[[ padded ]]', 'plain-text')).toBe('padded');
    expect(applyWikiLinks('[[ target | display ]]', 'plain-text')).toBe('display');
  });

  it('leaves body unchanged when there are no wiki links', () => {
    const body = 'No links here, just plain text.';
    expect(applyWikiLinks(body, 'plain-text')).toBe(body);
  });

  it('handles empty body', () => {
    expect(applyWikiLinks('', 'plain-text')).toBe('');
  });

  it('does not affect embed syntax ![[…]]', () => {
    // ![[…]] is handled separately by processEmbeds.
    // applyWikiLinks should still convert the [[…]] part inside the embed.
    // Current behaviour: the regex matches [[…]] anywhere including inside ![[…]].
    const body = '![[image.png]] and [[Note]]';
    const result = applyWikiLinks(body, 'plain-text');
    expect(result).toBe('!image.png and Note');
  });
});

// ── buildTitle ────────────────────────────────────────────────────────────────
//
// Prepends a folder prefix to the note title based on its vault path.
// 'none'       → rawTitle unchanged
// 'top-level'  → "TopFolder / rawTitle"
// 'full-path'  → "Folder/Sub / rawTitle"
// No prefix when the note is at the vault root (dir === '.').

describe('buildTitle', () => {
  // ── none strategy ─────────────────────────────────────────────────────────
  it('returns rawTitle unchanged for none strategy', () => {
    expect(buildTitle('My Note', 'Projects/Work/My Note.md', 'none')).toBe(
      'My Note',
    );
  });

  // ── top-level strategy ────────────────────────────────────────────────────
  it('prepends the top-level folder for top-level strategy', () => {
    expect(
      buildTitle('My Note', 'Projects/Work/My Note.md', 'top-level'),
    ).toBe('Projects / My Note');
  });

  it('uses the only folder when there is one level of nesting', () => {
    expect(buildTitle('Meeting', 'Work/Meeting.md', 'top-level')).toBe(
      'Work / Meeting',
    );
  });

  it('returns rawTitle unchanged when note is at vault root (top-level)', () => {
    expect(buildTitle('Root Note', 'Root Note.md', 'top-level')).toBe(
      'Root Note',
    );
  });

  // ── full-path strategy ────────────────────────────────────────────────────
  it('prepends full folder path for full-path strategy', () => {
    expect(
      buildTitle('My Note', 'Projects/Work/Meetings/My Note.md', 'full-path'),
    ).toBe('Projects/Work/Meetings / My Note');
  });

  it('uses the single folder for full-path when one level deep', () => {
    expect(buildTitle('Doc', 'Archive/Doc.md', 'full-path')).toBe(
      'Archive / Doc',
    );
  });

  it('returns rawTitle unchanged when note is at vault root (full-path)', () => {
    expect(buildTitle('Root Note', 'Root Note.md', 'full-path')).toBe(
      'Root Note',
    );
  });
});
