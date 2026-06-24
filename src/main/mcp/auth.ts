import { app, safeStorage } from 'electron';
import { randomBytes, timingSafeEqual } from 'crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'fs';
import { join } from 'path';

/**
 * Bearer-token management for the local MCP connector.
 *
 * Localhost is NOT a trust boundary — any process on the machine can reach a
 * 127.0.0.1 listener — so the connector requires a secret token on every
 * request. The token is generated with crypto.randomBytes and stored the same
 * way as the DB key: an encrypted blob (safeStorage / macOS Keychain) on disk,
 * never plaintext. See src/main/db/index.ts:getOrCreateDbKey for the pattern.
 */

let _token: string | null = null;

function tokenFilePath(): string {
  return join(app.getPath('userData'), 'mcp-token.key');
}

/**
 * Return the connector token, generating and persisting one on first use.
 * Cached in memory after the first read. If the on-disk blob can't be
 * decrypted (Keychain inaccessible / corrupt), a fresh token is generated —
 * unlike the DB key, a lost connector token is not catastrophic; the user
 * simply re-pastes the new URL into Claude.
 */
export function getOrCreateToken(): string {
  if (_token !== null) return _token;

  const path = tokenFilePath();
  if (existsSync(path)) {
    try {
      _token = safeStorage.decryptString(readFileSync(path));
      return _token;
    } catch {
      // Fall through and regenerate — a connector token is recoverable.
    }
  }
  return generateAndStore(path);
}

/**
 * Generate a new token, replacing any existing one. Any connector already
 * configured in Claude with the old token stops working until re-pasted.
 */
export function rotateToken(): string {
  return generateAndStore(tokenFilePath());
}

function generateAndStore(path: string): string {
  const token = randomBytes(32).toString('base64url'); // URL-safe, ~43 chars
  try {
    writeFileSync(path, safeStorage.encryptString(token));
    chmodSync(path, 0o600); // owner read/write only
  } catch {
    // If persistence fails the token still works for this session; it just
    // won't survive a restart. Don't crash the connector over it.
  }
  _token = token;
  return token;
}

/**
 * Constant-time comparison of a presented token against the active token.
 * Returns false for any missing/short/mismatched value. Uses timingSafeEqual
 * to avoid leaking length/byte information through timing.
 */
export function verifyToken(presented: string | undefined | null): boolean {
  if (!presented) return false;
  const expected = getOrCreateToken();
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch — length itself isn't secret,
  // so a fast unequal-length reject is acceptable and still constant-time
  // for equal-length inputs (the case an attacker would brute-force).
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Extract a bearer token from a request. Accepts either the
 * `Authorization: Bearer <token>` header (preferred) or a `/mcp/<token>`
 * path segment (capability URL) for clients that can't set custom headers.
 */
export function extractToken(
  authHeader: string | undefined,
  pathToken: string | undefined,
): string | undefined {
  if (authHeader) {
    const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (m && m[1]) return m[1];
  }
  return pathToken;
}

/** Test-only: clear the in-memory cache and delete the on-disk token file. */
export function _resetTokenForTests(): void {
  _token = null;
  try {
    rmSync(tokenFilePath(), { force: true });
  } catch {
    /* ignore */
  }
}
