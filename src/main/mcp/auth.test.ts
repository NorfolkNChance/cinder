import { describe, expect, it, beforeEach } from 'vitest';
import {
  getOrCreateToken,
  rotateToken,
  verifyToken,
  extractToken,
  _resetTokenForTests,
} from './auth';

/**
 * Token auth is mandatory because localhost is not a trust boundary. These
 * tests lock down the three security-relevant behaviours: generation/rotation,
 * constant-time verification (reject anything that isn't the exact token), and
 * extraction from either the Authorization header or a capability-URL path.
 *
 * `electron`'s safeStorage/app are stubbed by the vitest alias, so the token
 * is persisted to a temp dir — `_resetTokenForTests` clears it per test.
 */
describe('mcp auth', () => {
  beforeEach(() => {
    _resetTokenForTests();
  });

  it('generates a stable token and persists it across reads', () => {
    const t1 = getOrCreateToken();
    const t2 = getOrCreateToken();
    expect(t1).toBe(t2);
    expect(t1.length).toBeGreaterThanOrEqual(40); // 32 random bytes, base64url
  });

  it('rotateToken replaces the active token', () => {
    const before = getOrCreateToken();
    const after = rotateToken();
    expect(after).not.toBe(before);
    expect(verifyToken(before)).toBe(false); // old token no longer valid
    expect(verifyToken(after)).toBe(true);
  });

  it('verifyToken accepts only the exact token', () => {
    const token = getOrCreateToken();
    expect(verifyToken(token)).toBe(true);
    expect(verifyToken(undefined)).toBe(false);
    expect(verifyToken(null)).toBe(false);
    expect(verifyToken('')).toBe(false);
    expect(verifyToken('wrong')).toBe(false);
    expect(verifyToken(token + 'x')).toBe(false); // length mismatch
    expect(verifyToken(token.slice(0, -1))).toBe(false); // truncated
  });

  it('extractToken prefers the Authorization header, falls back to the path', () => {
    expect(extractToken('Bearer abc123', undefined)).toBe('abc123');
    expect(extractToken('bearer abc123', undefined)).toBe('abc123'); // case-insensitive
    expect(extractToken(undefined, 'pathtoken')).toBe('pathtoken');
    expect(extractToken('Bearer hdr', 'pathtoken')).toBe('hdr'); // header wins
    expect(extractToken(undefined, undefined)).toBeUndefined();
    expect(extractToken('Basic xyz', undefined)).toBeUndefined(); // not a bearer
  });
});
