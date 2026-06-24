import { app } from 'electron';
import { appendFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { McpAuditEntry } from '../../shared/schemas/connectors';

/**
 * Append-only audit log of MCP tool invocations.
 *
 * Every tool call Claude makes is recorded so the user can see exactly what a
 * connected client did (surfaced read-only in Settings → Connectors). Stored
 * as JSON Lines in `userData/mcp-audit.log`. Entries NEVER contain secrets —
 * only the tool name, outcome, and a short, sanitised argument summary.
 */

function logPath(): string {
  return join(app.getPath('userData'), 'mcp-audit.log');
}

/** Record one tool call. Best-effort — a logging failure never fails the call. */
export function record(tool: string, ok: boolean, summary: string): void {
  const entry: McpAuditEntry = {
    ts: new Date().toISOString(),
    tool,
    ok,
    // Hard cap: keep summaries short and strip newlines so one entry = one line.
    summary: summary.replace(/\s+/g, ' ').slice(0, 200),
  };
  try {
    appendFileSync(logPath(), JSON.stringify(entry) + '\n');
  } catch {
    /* ignore — auditing must not break the connector */
  }
}

/**
 * Return the most recent audit entries, newest first. Reads the tail of the
 * log file so history survives restarts. Malformed lines are skipped.
 */
export function getRecent(limit = 100): McpAuditEntry[] {
  const path = logPath();
  if (!existsSync(path)) return [];
  let lines: string[];
  try {
    lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
  const out: McpAuditEntry[] = [];
  for (const line of lines.slice(-limit).reverse()) {
    try {
      out.push(JSON.parse(line) as McpAuditEntry);
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}
