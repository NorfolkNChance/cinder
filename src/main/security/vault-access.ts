/**
 * Vault access control.
 *
 * The renderer is untrusted. `vault:scan` and `vault:import` both take a
 * `vaultPath` string in their payload — and `safeVaultPath()` only stops a
 * *relativePath* from escaping that root. It does nothing to constrain the
 * root itself. Without this module a compromised renderer could call
 *
 *   window.api.vault.scan({ vaultPath: '/Users/victim/.ssh', ... })
 *   window.api.vault.import({ vaultPath: '/', noteRelativePaths: ['etc/passwd'], ... })
 *
 * and read arbitrary files off disk — the exact `fs`-read primitive the
 * sandbox exists to deny.
 *
 * The fix: a vault root is only usable if the *user* chose it through the
 * native folder picker (`vault:pickFolder`). That handler calls
 * `rememberAuthorizedVault()` with the dialog's return value; the scan and
 * import handlers call `assertAuthorizedVault()` before touching the disk.
 * A path the renderer invents on its own is never in the set and is rejected.
 *
 * Paths are canonicalised with `realpathSync` before storing and comparing so
 * that macOS `/tmp → /private/tmp` style symlinks (and `.`/`..` segments) can't
 * be used to smuggle the same directory past an exact-string comparison.
 */

import { realpathSync } from 'fs';
import path from 'path';

/** Canonical absolute paths the user has authorised via the folder picker. */
const authorizedVaults = new Set<string>();

/**
 * Canonicalise a path for storage/comparison. Falls back to a plain
 * `path.resolve` if the path doesn't exist yet (realpath throws on ENOENT).
 */
function canonicalize(p: string): string {
  try {
    return realpathSync(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

/**
 * Record a vault root the user explicitly chose. Call this with the value
 * returned by the native folder picker — never with a renderer-supplied path.
 */
export function rememberAuthorizedVault(chosenPath: string): void {
  authorizedVaults.add(canonicalize(chosenPath));
}

/**
 * Throw unless `vaultPath` is a root the user previously authorised through
 * the folder picker. Call at the top of every vault IPC handler that reads
 * from disk, after Zod validation.
 */
export function assertAuthorizedVault(vaultPath: string): void {
  if (!authorizedVaults.has(canonicalize(vaultPath))) {
    throw new Error(
      'Vault access denied: the path was not selected via the folder picker.',
    );
  }
}

/** Test-only: clear the authorised set between cases. */
export function _resetAuthorizedVaults(): void {
  authorizedVaults.clear();
}
