import { describe, expect, it } from 'vitest';
import { parseKeyFileContent } from './key-file';

/**
 * Unit tests for the exported-key-file parser.
 *
 * This function gates the restore and key-import flows: a false negative
 * locks a user out of their own backup, a false positive would push a
 * garbage key into the Keychain. Both directions are pinned here.
 */

const KEY = 'a'.repeat(32) + 'B'.repeat(16) + '0123456789abcdef';

/** The exact format exportKeyBackup() writes. */
const EXPORTED_FILE = [
  'Cinder Database Encryption Key',
  '================================',
  '',
  'Keep this file somewhere safe — separate from your database backup.',
  '',
  `Key: ${KEY}`,
  '',
  'Exported: 2026-08-12T09:00:00.000Z',
  'App version: 1.11.0',
].join('\n');

describe('parseKeyFileContent', () => {
  it('extracts the key from a full exported key file', () => {
    expect(parseKeyFileContent(EXPORTED_FILE)).toBe(KEY.toLowerCase());
  });

  it('accepts a file containing only the bare 64-hex key', () => {
    expect(parseKeyFileContent(KEY)).toBe(KEY.toLowerCase());
    expect(parseKeyFileContent(`  ${KEY}\n`)).toBe(KEY.toLowerCase());
  });

  it('lower-cases mixed-case keys (SQLCipher hex is case-insensitive)', () => {
    const parsed = parseKeyFileContent(`Key: ${KEY.toUpperCase()}`);
    expect(parsed).toBe(KEY.toLowerCase());
  });

  it('rejects keys of the wrong length', () => {
    expect(parseKeyFileContent(`Key: ${'a'.repeat(63)}`)).toBeNull();
    expect(parseKeyFileContent('a'.repeat(65))).toBeNull();
  });

  it('rejects non-hex content of the right length', () => {
    expect(parseKeyFileContent('g'.repeat(64))).toBeNull();
  });

  it('rejects empty and unrelated content', () => {
    expect(parseKeyFileContent('')).toBeNull();
    expect(parseKeyFileContent('this file is not a key')).toBeNull();
  });

  it('does not treat a 64-hex run inside prose as a bare key without the Key: prefix', () => {
    // Multi-line content without a `Key:` line must match the bare form
    // exactly — a hash embedded in other text is not a key.
    expect(parseKeyFileContent(`checksum ${'a'.repeat(64)} end`)).toBeNull();
  });
});
