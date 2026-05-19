import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, sep } from 'path';
import {
  AttachmentPathError,
  validateAttachmentPath,
} from './attachment-path';

const NOTE_ID = '01911e0a-7e6e-7d4a-9e2f-1234567890ab';

describe('validateAttachmentPath', () => {
  let root: string;
  /** Canonical root used for path-equality assertions — see attachment-path.ts. */
  let canonicalRoot: string;
  let outside: string;
  let base: string;

  beforeEach(() => {
    // Fresh temp directories per test so a leaked file from one case
    // can't influence another.
    base = mkdtempSync(join(tmpdir(), 'cinder-attach-test-'));
    root = join(base, 'attachments');
    outside = join(base, 'outside');
    mkdirSync(root, { recursive: true });
    mkdirSync(outside, { recursive: true });
    mkdirSync(join(root, NOTE_ID));
    canonicalRoot = realpathSync(root);
  });

  afterEach(() => {
    if (base) rmSync(base, { recursive: true, force: true });
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('accepts a simple filename inside a note folder', () => {
    const result = validateAttachmentPath(root, NOTE_ID, 'photo.png');
    expect(result).toBe(join(canonicalRoot, NOTE_ID, 'photo.png'));
  });

  it('accepts a filename containing dots that are not directory references', () => {
    expect(validateAttachmentPath(root, NOTE_ID, 'my.file.png')).toBe(
      join(canonicalRoot, NOTE_ID, 'my.file.png'),
    );
  });

  it('accepts filenames with non-ASCII characters', () => {
    expect(validateAttachmentPath(root, NOTE_ID, 'résumé.pdf')).toBe(
      join(canonicalRoot, NOTE_ID, 'résumé.pdf'),
    );
  });

  // ── noteId rejection ──────────────────────────────────────────────────────

  it('rejects a noteId that is not a UUID', () => {
    expect(() => validateAttachmentPath(root, 'not-a-uuid', 'x.png')).toThrow(
      AttachmentPathError,
    );
  });

  it('rejects a noteId containing a path separator', () => {
    expect(() =>
      validateAttachmentPath(root, '../etc', 'x.png'),
    ).toThrow(AttachmentPathError);
  });

  it('rejects an uppercase-hex noteId', () => {
    // UUIDs from uuid@11 v7() are lowercase. Locking this in makes
    // collision-by-casing impossible on a case-insensitive filesystem.
    const upper = NOTE_ID.toUpperCase();
    expect(() => validateAttachmentPath(root, upper, 'x.png')).toThrow(
      AttachmentPathError,
    );
  });

  // ── filename rejection ────────────────────────────────────────────────────

  it('rejects an empty filename', () => {
    expect(() => validateAttachmentPath(root, NOTE_ID, '')).toThrow(
      AttachmentPathError,
    );
  });

  it('rejects filename === "."', () => {
    expect(() => validateAttachmentPath(root, NOTE_ID, '.')).toThrow(
      AttachmentPathError,
    );
  });

  it('rejects filename === ".."', () => {
    expect(() => validateAttachmentPath(root, NOTE_ID, '..')).toThrow(
      AttachmentPathError,
    );
  });

  it('rejects filename containing forward slash', () => {
    expect(() => validateAttachmentPath(root, NOTE_ID, 'a/b.png')).toThrow(
      AttachmentPathError,
    );
  });

  it('rejects filename containing backslash', () => {
    expect(() =>
      validateAttachmentPath(root, NOTE_ID, 'a\\b.png'),
    ).toThrow(AttachmentPathError);
  });

  it('rejects filename containing NUL byte', () => {
    expect(() =>
      validateAttachmentPath(root, NOTE_ID, 'a\x00b.png'),
    ).toThrow(AttachmentPathError);
  });

  it('rejects filename exceeding 255 chars', () => {
    expect(() =>
      validateAttachmentPath(root, NOTE_ID, `${'a'.repeat(252)}.png`),
    ).toThrow(AttachmentPathError);
  });

  // ── Traversal & symlink escape ────────────────────────────────────────────

  it('rejects a path that would escape via a literal .. segment (defense in depth)', () => {
    // The filename-level check catches this first, but if the noteId
    // check were ever relaxed the prefix check should still catch it.
    expect(() => validateAttachmentPath(root, NOTE_ID, '../escape')).toThrow(
      AttachmentPathError,
    );
  });

  it('rejects when the file is a symlink pointing outside the root', () => {
    // Layout:
    //   root/<note>/sneaky.png  →  outside/secret.txt
    const sneakyLink = join(root, NOTE_ID, 'sneaky.png');
    const target = join(outside, 'secret.txt');
    writeFileSync(target, 'secrets');
    symlinkSync(target, sneakyLink);

    expect(() =>
      validateAttachmentPath(root, NOTE_ID, 'sneaky.png'),
    ).toThrow(AttachmentPathError);
  });

  it('accepts a symlink that resolves back inside the root', () => {
    // Layout: link inside the note folder → another file inside the same folder.
    const target = join(root, NOTE_ID, 'real.png');
    const link = join(root, NOTE_ID, 'alias.png');
    writeFileSync(target, 'pixels');
    symlinkSync(target, link);

    expect(() =>
      validateAttachmentPath(root, NOTE_ID, 'alias.png'),
    ).not.toThrow();
  });

  it('accepts a non-existent file (write path)', () => {
    // For the write side of saveAttachment the file does not yet exist;
    // the realpath check should be a no-op rather than a rejection.
    const result = validateAttachmentPath(root, NOTE_ID, 'new-file.png');
    expect(result).toBe(join(canonicalRoot, NOTE_ID, 'new-file.png'));
  });

  // ── Returned path ─────────────────────────────────────────────────────────

  it('always returns an absolute path inside the (canonical) root', () => {
    const result = validateAttachmentPath(root, NOTE_ID, 'photo.png');
    expect(result.startsWith(canonicalRoot + sep)).toBe(true);
  });
});
