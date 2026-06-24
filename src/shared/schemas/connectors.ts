import { z } from 'zod';

/**
 * Zod schemas for the `connectors` domain — the local MCP server that lets
 * Claude (Desktop / claude.ai) connect to Cinder as a custom connector.
 *
 * The server runs inside the main process, bound to 127.0.0.1, and is a new
 * untrusted-input boundary (like the renderer/IPC boundary). These schemas
 * validate the renderer↔main control surface; the MCP tool boundary itself
 * reuses the per-domain schemas (notes/tasks/…) plus a bearer-token check.
 *
 * See ADR-0011 and the "MCP Connector" section in CLAUDE.md.
 */

// ── Status (main → renderer) ─────────────────────────────────────────────────

/**
 * The full connector status the Settings UI renders. `token` and `url` are
 * surfaced to the renderer deliberately — the renderer is our own UI and can
 * already read all data over IPC, so showing the connection secret it must
 * paste into Claude adds no new exposure.
 */
export const McpServerStatus = z.object({
  /** The persisted enable setting (user intent). */
  enabled: z.boolean(),
  /** Whether the HTTP listener is actually up right now. */
  running: z.boolean(),
  /** The configured (requested) port. */
  port: z.number().int(),
  /** The port actually bound, or null when not running (may differ if the
   *  configured port was taken and an ephemeral one was used instead). */
  boundPort: z.number().int().nullable(),
  /** Whether write tools are exposed to connected clients. */
  allowWrites: z.boolean(),
  /** The bearer token clients authenticate with. */
  token: z.string(),
  /** The base connector URL to paste into Claude (no token in the path). */
  url: z.string(),
});
export type McpServerStatus = z.infer<typeof McpServerStatus>;

// ── Audit log ────────────────────────────────────────────────────────────────

/** One recorded MCP tool invocation. Never contains secrets. */
export const McpAuditEntry = z.object({
  /** ISO-8601 timestamp. */
  ts: z.string(),
  /** Tool name, e.g. 'search_notes'. */
  tool: z.string(),
  /** Whether the call succeeded. */
  ok: z.boolean(),
  /** Short, non-sensitive summary of the call (e.g. a truncated query). */
  summary: z.string(),
});
export type McpAuditEntry = z.infer<typeof McpAuditEntry>;

// ── Inputs ──────────────────────────────────────────────────────────────────

export const McpSetEnabledInput = z.object({ enabled: z.boolean() });
export type McpSetEnabledInput = z.infer<typeof McpSetEnabledInput>;

export const McpSetAllowWritesInput = z.object({ allowWrites: z.boolean() });
export type McpSetAllowWritesInput = z.infer<typeof McpSetAllowWritesInput>;

export const McpGetAuditLogInput = z.object({
  limit: z.number().int().min(1).max(500).optional(),
});
export type McpGetAuditLogInput = z.infer<typeof McpGetAuditLogInput>;
