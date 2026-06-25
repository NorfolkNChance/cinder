import { describe, expect, it } from 'vitest';
import {
  compareVersionsDesc,
  npxCandidatePaths,
  buildClaudeDesktopConfig,
} from './bridge-config';

describe('compareVersionsDesc', () => {
  it('orders nvm versions newest-first', () => {
    const v = ['v18.20.4', 'v24.15.0', 'v20.11.1', 'v24.2.0'];
    expect([...v].sort(compareVersionsDesc)).toEqual([
      'v24.15.0',
      'v24.2.0',
      'v20.11.1',
      'v18.20.4',
    ]);
  });
});

describe('npxCandidatePaths', () => {
  it('lists newest nvm npx first, then Homebrew, then system', () => {
    const paths = npxCandidatePaths('/Users/x', ['v20.11.1', 'v24.15.0']);
    expect(paths[0]).toBe('/Users/x/.nvm/versions/node/v24.15.0/bin/npx');
    expect(paths[1]).toBe('/Users/x/.nvm/versions/node/v20.11.1/bin/npx');
    expect(paths).toContain('/opt/homebrew/bin/npx');
    expect(paths).toContain('/usr/local/bin/npx');
    expect(paths).toContain('/usr/bin/npx');
  });

  it('still returns Homebrew/system candidates when nvm has no versions', () => {
    const paths = npxCandidatePaths('/Users/x', []);
    expect(paths).toEqual(['/opt/homebrew/bin/npx', '/usr/local/bin/npx', '/usr/bin/npx']);
  });
});

describe('buildClaudeDesktopConfig', () => {
  it('bakes in an absolute command + PATH and the bearer token', () => {
    const json = buildClaudeDesktopConfig({
      url: 'http://127.0.0.1:51789/mcp',
      token: 'TOKEN123',
      command: '/Users/x/.nvm/versions/node/v24.15.0/bin/npx',
      binDir: '/Users/x/.nvm/versions/node/v24.15.0/bin',
    });
    const cfg = JSON.parse(json);
    const cinder = cfg.mcpServers.cinder;
    expect(cinder.command).toBe('/Users/x/.nvm/versions/node/v24.15.0/bin/npx');
    expect(cinder.args).toContain('mcp-remote');
    expect(cinder.args).toContain('http://127.0.0.1:51789/mcp');
    expect(cinder.args).toContain('Authorization: Bearer TOKEN123');
    expect(cinder.args).toContain('http-only');
    expect(cinder.env.PATH).toBe('/Users/x/.nvm/versions/node/v24.15.0/bin:/usr/bin:/bin');
  });

  it('omits the env/PATH block when no absolute bin dir is known (bare npx fallback)', () => {
    const json = buildClaudeDesktopConfig({
      url: 'http://127.0.0.1:51789/mcp',
      token: 'TOKEN123',
      command: 'npx',
      binDir: null,
    });
    const cinder = JSON.parse(json).mcpServers.cinder;
    expect(cinder.command).toBe('npx');
    expect(cinder.env).toBeUndefined();
  });
});
