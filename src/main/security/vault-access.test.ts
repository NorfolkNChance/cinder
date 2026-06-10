import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  assertAuthorizedVault,
  rememberAuthorizedVault,
  _resetAuthorizedVaults,
} from './vault-access';

describe('vault-access', () => {
  let dir: string;

  beforeEach(() => {
    _resetAuthorizedVaults();
    dir = mkdtempSync(join(tmpdir(), 'vault-access-'));
  });

  afterEach(() => {
    _resetAuthorizedVaults();
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects a path that was never authorised', () => {
    expect(() => assertAuthorizedVault('/Users/victim/.ssh')).toThrow(
      /Vault access denied/,
    );
  });

  it('accepts a path after it has been authorised', () => {
    rememberAuthorizedVault(dir);
    expect(() => assertAuthorizedVault(dir)).not.toThrow();
  });

  it('rejects an arbitrary path even after a different vault is authorised', () => {
    rememberAuthorizedVault(dir);
    expect(() => assertAuthorizedVault('/etc')).toThrow(/Vault access denied/);
  });

  it('canonicalises so . and .. segments cannot smuggle an unauthorised root', () => {
    rememberAuthorizedVault(dir);
    // dir/.. is the tmp parent — must NOT be treated as authorised.
    expect(() => assertAuthorizedVault(join(dir, '..'))).toThrow(
      /Vault access denied/,
    );
    // dir/./ resolves back to dir — must be accepted.
    expect(() => assertAuthorizedVault(join(dir, '.'))).not.toThrow();
  });

  it('resolves symlinks so an aliased path to the same dir is accepted', () => {
    const link = join(tmpdir(), `vault-link-${Date.now()}`);
    symlinkSync(dir, link);
    try {
      rememberAuthorizedVault(dir);
      // The symlink canonicalises to the same realpath — accepted.
      expect(() => assertAuthorizedVault(link)).not.toThrow();
    } finally {
      rmSync(link, { force: true });
    }
  });
});
