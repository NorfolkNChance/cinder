import { z } from 'zod';

/**
 * Typed application settings.
 *
 * Stored as individual key/value rows in the `settings` SQLite table;
 * values are JSON-serialized strings. The Zod schemas here provide both
 * runtime validation (on read from DB) and TypeScript types for the
 * renderer and main process.
 *
 * To add a setting:
 *  1. Add a field to `AppSettings` with a default in `DEFAULT_SETTINGS`.
 *  2. Add the key to `SETTINGS_KEYS`.
 *  3. No migration needed — missing rows fall back to defaults automatically.
 */

// ── Matrix ───────────────────────────────────────────────────────────────────

/** Days ahead that count as "urgent". 0 = only tasks due today are urgent. */
const MatrixUrgencyDays = z.number().int().min(0).max(30);

/**
 * Priority threshold for "important" in the Eisenhower matrix.
 * Priorities ≤ this value are classified as important (1 = highest priority).
 */
const MatrixImportanceCutoff = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

// ── Tasks ────────────────────────────────────────────────────────────────────

/** Which task scope the sidebar opens to on startup. */
const DefaultTaskScope = z.enum(['inbox', 'today', 'upcoming']);

/** Whether the task list shows completed tasks by default. */
const ShowCompleted = z.boolean();

// ── Notifications ────────────────────────────────────────────────────────────

/** Whether macOS notifications are enabled for due/overdue tasks. */
const NotificationsEnabled = z.boolean();

// ── Backup ───────────────────────────────────────────────────────────────────

/** Automatically back up the database when the app quits. */
const BackupAutoOnQuit = z.boolean();

/** Number of auto-backup files to keep before rotating old ones out (1–30). */
const BackupKeepCount = z.number().int().min(1).max(30);

// ── Trash ────────────────────────────────────────────────────────────────────

/**
 * Whether trashed items are automatically purged (hard-deleted) after the
 * retention window. When false, trash is kept until manually emptied.
 */
const TrashAutoPurgeEnabled = z.boolean();

/** Days a deleted item stays in Trash before the purge job removes it. */
const TrashRetentionDays = z.number().int().min(1).max(365);

// ── Editor ───────────────────────────────────────────────────────────────────

/** Whether the macOS native spellchecker is active in the note editor. */
const EditorSpellcheck = z.boolean();

// ── Daily Notes ──────────────────────────────────────────────────────────────

/** Markdown template applied to new daily notes. Empty string = blank note. */
const DailyTemplate = z.string().max(50_000);

// ── Note History ─────────────────────────────────────────────────────────────

/** Whether revision snapshots are captured for regular notes. */
const HistoryEnabled = z.boolean();

/** Revisions kept per note; oldest are trimmed beyond this cap. */
const HistoryRetentionCount = z.number().int().min(1).max(500);

/**
 * Minimum age (minutes) the most recent revision must reach before a new
 * one is cut. Coalesces continuous editing into periodic checkpoints
 * instead of one revision per autosave — see docs/specs/note-history.md §4.
 */
const HistoryMinIntervalMinutes = z.number().int().min(1).max(1440);

// ── Summary ──────────────────────────────────────────────────────────────────

/** Whether the app opens in Summary mode on launch. */
const SummaryOpenOnLaunch = z.boolean();

/**
 * UTC ISO-8601 instant the previous session ended, written by the main
 * process during `will-quit`. Empty string until the first quit. System-
 * managed — not surfaced as an editable field in the Settings UI. The
 * Summary "since last session" card diffs against this value.
 */
const SummaryLastSessionEndedAt = z.string().max(40);

// ── Appearance ───────────────────────────────────────────────────────────────

/** UI colour scheme preference. */
const AppearanceTheme = z.enum(['auto', 'light', 'dark']);

// ── Connectors (MCP server) ──────────────────────────────────────────────────

/** Whether the local MCP server (for connecting Claude) is running. */
const McpEnabled = z.boolean();

/**
 * Whether write tools (create/update/complete) are exposed to Claude.
 * Read tools are always available when the server is enabled; writes are
 * opt-in so a connected client cannot modify or delete data by default.
 */
const McpAllowWrites = z.boolean();

/** TCP port the loopback MCP server binds to (127.0.0.1 only). */
const McpPort = z.number().int().min(1024).max(65_535);

// ── Aggregated schema ────────────────────────────────────────────────────────

export const AppSettingsSchema = z.object({
  'matrix.urgencyDays': MatrixUrgencyDays,
  'matrix.importanceCutoff': MatrixImportanceCutoff,
  'tasks.defaultScope': DefaultTaskScope,
  'tasks.showCompleted': ShowCompleted,
  'summary.openOnLaunch': SummaryOpenOnLaunch,
  'summary.lastSessionEndedAt': SummaryLastSessionEndedAt,
  'editor.spellcheck': EditorSpellcheck,
  'daily.template': DailyTemplate,
  'notes.history.enabled': HistoryEnabled,
  'notes.history.retentionCount': HistoryRetentionCount,
  'notes.history.minIntervalMinutes': HistoryMinIntervalMinutes,
  'appearance.theme': AppearanceTheme,
  'notifications.enabled': NotificationsEnabled,
  'backup.autoOnQuit': BackupAutoOnQuit,
  'backup.keepCount': BackupKeepCount,
  'trash.autoPurgeEnabled': TrashAutoPurgeEnabled,
  'trash.retentionDays': TrashRetentionDays,
  'connectors.mcp.enabled': McpEnabled,
  'connectors.mcp.allowWrites': McpAllowWrites,
  'connectors.mcp.port': McpPort,
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type SettingKey = keyof AppSettings;

export const DEFAULT_SETTINGS: AppSettings = {
  'matrix.urgencyDays': 0,
  'matrix.importanceCutoff': 2,
  'tasks.defaultScope': 'inbox',
  'tasks.showCompleted': false,
  // Summary is the landing page by default — it's the "what needs me" view.
  'summary.openOnLaunch': true,
  'summary.lastSessionEndedAt': '',
  'editor.spellcheck': true,
  'daily.template': '',
  'notes.history.enabled': true,
  'notes.history.retentionCount': 50,
  'notes.history.minIntervalMinutes': 10,
  'appearance.theme': 'auto',
  'notifications.enabled': true,
  'backup.autoOnQuit': true,
  'backup.keepCount': 7,
  // Trash: purge deleted items after 30 days by default. Users who never
  // want data auto-deleted can switch the purge off entirely.
  'trash.autoPurgeEnabled': true,
  'trash.retentionDays': 30,
  // Connector is OFF by default — nothing listens until the user opts in.
  'connectors.mcp.enabled': false,
  // Writes are OFF by default — Claude can read but not modify until enabled.
  'connectors.mcp.allowWrites': false,
  'connectors.mcp.port': 51789,
};

// ── IPC input/output schemas ─────────────────────────────────────────────────

/** Returned by `settings.getAll` — always a complete settings object. */
export const SettingsGetAllResult = AppSettingsSchema;
export type SettingsGetAllResult = AppSettings;

/**
 * Set a single setting. The value is typed as `unknown` at the IPC boundary
 * and narrowed in the service using the per-key Zod schema.
 */
export const SettingsSetInput = z.object({
  key: z.string(),
  value: z.unknown(),
});
export type SettingsSetInput = z.infer<typeof SettingsSetInput>;

/** Returns the updated full settings object so the renderer stays in sync. */
export const SettingsSetResult = AppSettingsSchema;
export type SettingsSetResult = AppSettings;

// ── Per-key validation ───────────────────────────────────────────────────────

/**
 * Validate a value against the schema for a specific key.
 * Returns the parsed value or throws a ZodError.
 */
export function parseSettingValue<K extends SettingKey>(
  key: K,
  value: unknown,
): AppSettings[K] {
  return AppSettingsSchema.shape[key].parse(value) as AppSettings[K];
}
