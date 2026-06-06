# M4 — Vault Service Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unit tests for `vaultScanner.ts` and `vaultImporter.ts`, covering the pure-logic helpers that have no existing test coverage.

**Architecture:** The scanner and importer both contain pure helper functions (`tryParseDailyDate`, `extractTitle`, `countWikiLinks`, `applyWikiLinks`, `buildTitle`, `safeVaultPath`) that can be tested without a database or Electron. These helpers are extracted and tested directly. The DB-touching `scanVault` and `importVault` functions are out of scope — those require a full SQLCipher integration environment that vitest's Node runner doesn't support.

**Tech Stack:** Vitest (already configured), Node `fs`, `os`, `path` for temp directories — same pattern as `attachment-path.test.ts`.

---

## File Structure

| Action | Path | Purpose |
|--------|------|---------|
| Create | `src/main/services/vaultScanner.test.ts` | Tests for `tryParseDailyDate`, `extractTitle`, `countWikiLinks` |
| Create | `src/main/services/vaultImporter.test.ts` | Tests for `applyWikiLinks`, `buildTitle`, `safeVaultPath` |
| Modify | `src/main/services/vaultScanner.ts` | Export `tryParseDailyDate` and `extractTitle` (currently unexported) |
| Modify | `src/main/services/vaultImporter.ts` | Export `applyWikiLinks`, `buildTitle`, `safeVaultPath` (currently unexported) |

---

## Task 1: Export the pure helpers from vaultScanner.ts

The functions `tryParseDailyDate` and `extractTitle` are currently module-private. They need to be exported so the test file can import them directly.

**Files:**
- Modify: `src/main/services/vaultScanner.ts`

- [ ] **Step 1: Add `export` keyword to `tryParseDailyDate` and `extractTitle`**

In `src/main/services/vaultScanner.ts`, change:

```ts
function tryParseDailyDate(relativeToRoot: string): string | null {
```
to:
```ts
export function tryParseDailyDate(relativeToRoot: string): string | null {
```

And change:
```ts
function extractTitle(content: string, filenameStem: string): string {
```
to:
```ts
export function extractTitle(content: string, filenameStem: string): string {
```

`countWikiLinks` is already exported at the bottom of the file via the re-export line — no change needed there.

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/services/vaultScanner.ts
git commit -m "refactor: export tryParseDailyDate and extractTitle for testing"
```

---

## Task 2: Export the pure helpers from vaultImporter.ts

`applyWikiLinks`, `buildTitle`, and `safeVaultPath` are module-private.

**Files:**
- Modify: `src/main/services/vaultImporter.ts`

- [ ] **Step 1: Add `export` keyword to the three functions**

In `src/main/services/vaultImporter.ts`, change:

```ts
function safeVaultPath(vaultRoot: string, relativePath: string): string {
```
to:
```ts
export function safeVaultPath(vaultRoot: string, relativePath: string): string {
```

Change:
```ts
function applyWikiLinks(
  body: string,
  strategy: 'plain-text' | 'leave-as-is',
): string {
```
to:
```ts
export function applyWikiLinks(
  body: string,
  strategy: 'plain-text' | 'leave-as-is',
): string {
```

Change:
```ts
function buildTitle(
  rawTitle: string,
  relativePath: string,
  strategy: 'top-level' | 'full-path' | 'none',
): string {
```
to:
```ts
export function buildTitle(
  rawTitle: string,
  relativePath: string,
  strategy: 'top-level' | 'full-path' | 'none',
): string {
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/services/vaultImporter.ts
git commit -m "refactor: export applyWikiLinks, buildTitle, safeVaultPath for testing"
```

---

## Task 3: Write vaultScanner tests — tryParseDailyDate

**Files:**
- Create: `src/main/services/vaultScanner.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/main/services/vaultScanner.test.ts`:

```ts
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

  it('returns null for Feb 30', () => {
    expect(tryParseDailyDate('2026-02-30.md')).toBeNull();
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
```

- [ ] **Step 2: Run tests to verify they all pass**

```bash
npx vitest run src/main/services/vaultScanner.test.ts --reporter=verbose
```
Expected: all tests PASS. If any fail, the exported function may differ from what the test assumes — re-read the function and adjust the test expectation (not the function).

- [ ] **Step 3: Commit**

```bash
git add src/main/services/vaultScanner.test.ts
git commit -m "test: tryParseDailyDate — all date patterns and edge cases"
```

---

## Task 4: Write vaultScanner tests — extractTitle and countWikiLinks

**Files:**
- Modify: `src/main/services/vaultScanner.test.ts`

- [ ] **Step 1: Append the extractTitle and countWikiLinks test suites to the file**

Add to the end of `src/main/services/vaultScanner.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they all pass**

```bash
npx vitest run src/main/services/vaultScanner.test.ts --reporter=verbose
```
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/services/vaultScanner.test.ts
git commit -m "test: extractTitle and countWikiLinks coverage"
```

---

## Task 5: Write vaultImporter tests — applyWikiLinks and buildTitle

**Files:**
- Create: `src/main/services/vaultImporter.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/main/services/vaultImporter.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they all pass**

```bash
npx vitest run src/main/services/vaultImporter.test.ts --reporter=verbose
```
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/services/vaultImporter.test.ts
git commit -m "test: applyWikiLinks and buildTitle coverage"
```

---

## Task 6: Write vaultImporter tests — safeVaultPath

`safeVaultPath` validates that a renderer-supplied relative path stays inside the vault root, throwing on traversal attempts. This uses real temp directories — same pattern as `attachment-path.test.ts`.

**Files:**
- Modify: `src/main/services/vaultImporter.test.ts`

- [ ] **Step 1: Append the safeVaultPath suite to the test file**

Add to the end of `src/main/services/vaultImporter.test.ts`:

```ts
import { afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { safeVaultPath } from './vaultImporter';

// ── safeVaultPath ─────────────────────────────────────────────────────────────
//
// Resolves relativePath against vaultRoot and throws if the result
// escapes the vault. Uses real temp directories so path.resolve()
// behaves as it does in production.

describe('safeVaultPath', () => {
  let vaultRoot: string;

  beforeEach(() => {
    vaultRoot = mkdtempSync(join(tmpdir(), 'cinder-vault-test-'));
  });

  afterEach(() => {
    if (vaultRoot) rmSync(vaultRoot, { recursive: true, force: true });
  });

  it('returns the resolved absolute path for a simple relative path', () => {
    const result = safeVaultPath(vaultRoot, 'notes/my-note.md');
    expect(result).toBe(join(vaultRoot, 'notes', 'my-note.md'));
  });

  it('accepts a filename at the vault root level', () => {
    const result = safeVaultPath(vaultRoot, 'note.md');
    expect(result).toBe(join(vaultRoot, 'note.md'));
  });

  it('throws on a literal path-traversal attempt (../)', () => {
    expect(() => safeVaultPath(vaultRoot, '../etc/passwd')).toThrow(
      'Path traversal detected',
    );
  });

  it('throws on a nested path-traversal attempt', () => {
    expect(() =>
      safeVaultPath(vaultRoot, 'notes/../../etc/passwd'),
    ).toThrow('Path traversal detected');
  });

  it('throws on an absolute path supplied as relativePath', () => {
    // An absolute path like /etc/passwd resolves to itself, which is
    // outside the vault root.
    expect(() => safeVaultPath(vaultRoot, '/etc/passwd')).toThrow(
      'Path traversal detected',
    );
  });
});
```

- [ ] **Step 2: Run all importer tests**

```bash
npx vitest run src/main/services/vaultImporter.test.ts --reporter=verbose
```
Expected: all tests PASS.

- [ ] **Step 3: Run the full test suite to confirm nothing regressed**

```bash
npm run test
```
Expected: all 279+ tests PASS (number will increase with the new tests).

- [ ] **Step 4: Commit**

```bash
git add src/main/services/vaultImporter.test.ts
git commit -m "test: safeVaultPath path-traversal protection"
```

---

## Task 7: Update ROADMAP.md and CLAUDE.md

**Files:**
- Modify: `ROADMAP.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Mark M4 as shipped in ROADMAP.md**

In `ROADMAP.md`, find the `### M4 — Tests for vault services` section under Medium priority and add `~~` strikethrough to the heading and an `✅ shipped` suffix:

```markdown
### ~~M4 — Tests for vault services~~ ✅ shipped
```

- [ ] **Step 2: Add M4 to the Current status table in CLAUDE.md**

In `CLAUDE.md`, find the "Current status" table and add a new row:

```markdown
| + | Vault service tests — `tryParseDailyDate`, `extractTitle`, `countWikiLinks`, `applyWikiLinks`, `buildTitle`, `safeVaultPath` |
```

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md CLAUDE.md
git commit -m "docs: mark M4 vault service tests as shipped"
```
