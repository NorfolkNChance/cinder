import { existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { dirname } from 'path';

/**
 * Generates the Claude Desktop `claude_desktop_config.json` snippet that wires
 * Cinder up via the `mcp-remote` stdio↔HTTP bridge.
 *
 * Why this lives in the main process: Claude Desktop is a GUI app and does NOT
 * inherit the user's shell PATH, so a bare `"command": "npx"` fails to spawn
 * for anyone using nvm or Homebrew Node (the common dev setup). The sandboxed
 * renderer can't probe the filesystem, but main can — so we resolve an absolute
 * `npx` path here and bake it (plus a minimal PATH) into the generated config.
 */

/** Parse an nvm version dir like "v24.15.0" into numeric components. */
function parseVersion(v: string): number[] {
  return v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
}

/** Compare two nvm version strings, newest first. */
export function compareVersionsDesc(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Build the ordered list of candidate absolute `npx` paths to probe, newest
 * nvm Node first, then Homebrew, then system. Pure — `nvmNodeVersions` is the
 * (possibly empty) list of dir names under `~/.nvm/versions/node`.
 */
export function npxCandidatePaths(home: string, nvmNodeVersions: readonly string[]): string[] {
  const nvm = [...nvmNodeVersions]
    .sort(compareVersionsDesc)
    .map((v) => `${home}/.nvm/versions/node/${v}/bin/npx`);
  return [...nvm, '/opt/homebrew/bin/npx', '/usr/local/bin/npx', '/usr/bin/npx'];
}

export interface ResolvedNpx {
  /** Absolute path to npx, or the bare string 'npx' if none was found. */
  command: string;
  /** Directory containing the resolved npx (for the PATH entry), or null. */
  binDir: string | null;
  /** True when an absolute npx path was found on disk. */
  found: boolean;
}

/**
 * Resolve an absolute `npx` for the bridge command. Probes nvm (newest first),
 * Homebrew, and system locations. Falls back to bare `npx` (relying on PATH)
 * when nothing is found.
 */
export function resolveNpx(): ResolvedNpx {
  const home = homedir();
  let nvmVersions: string[] = [];
  try {
    nvmVersions = readdirSync(`${home}/.nvm/versions/node`);
  } catch {
    // No nvm — fine, fall through to Homebrew/system candidates.
  }
  for (const candidate of npxCandidatePaths(home, nvmVersions)) {
    if (existsSync(candidate)) {
      return { command: candidate, binDir: dirname(candidate), found: true };
    }
  }
  return { command: 'npx', binDir: null, found: false };
}

/**
 * Build the pretty-printed Claude Desktop config snippet. Pure: given the
 * connector URL/token and a resolved command, returns the JSON string. The
 * bearer token is placed literally in the header arg (mcp-remote forwards it
 * verbatim), and a minimal PATH is added when we have an absolute bin dir.
 */
export function buildClaudeDesktopConfig(opts: {
  url: string;
  token: string;
  command: string;
  binDir: string | null;
}): string {
  const server: {
    command: string;
    args: string[];
    env?: Record<string, string>;
  } = {
    command: opts.command,
    args: [
      '-y',
      'mcp-remote',
      opts.url,
      '--transport',
      'http-only',
      '--header',
      `Authorization: Bearer ${opts.token}`,
    ],
  };
  // Give the spawned npx a PATH that includes Node's bin dir, so it can find
  // `node` even though Claude Desktop launches with a minimal environment.
  if (opts.binDir) {
    server.env = { PATH: `${opts.binDir}:/usr/bin:/bin` };
  }
  return JSON.stringify({ mcpServers: { cinder: server } }, null, 2);
}
