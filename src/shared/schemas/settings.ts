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

// ── Appearance ───────────────────────────────────────────────────────────────

/** UI colour scheme preference. */
const AppearanceTheme = z.enum(['auto', 'light', 'dark']);

// ── Aggregated schema ────────────────────────────────────────────────────────

export const AppSettingsSchema = z.object({
  'matrix.urgencyDays': MatrixUrgencyDays,
  'matrix.importanceCutoff': MatrixImportanceCutoff,
  'tasks.defaultScope': DefaultTaskScope,
  'tasks.showCompleted': ShowCompleted,
  'appearance.theme': AppearanceTheme,
  'notifications.enabled': NotificationsEnabled,
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type SettingKey = keyof AppSettings;

export const DEFAULT_SETTINGS: AppSettings = {
  'matrix.urgencyDays': 0,
  'matrix.importanceCutoff': 2,
  'tasks.defaultScope': 'inbox',
  'tasks.showCompleted': false,
  'appearance.theme': 'auto',
  'notifications.enabled': true,
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
