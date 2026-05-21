/**
 * Settings service.
 *
 * Reads and writes settings to the `settings` table. All access goes through
 * typed helpers — callers never see raw JSON strings or deal with defaults.
 *
 * Design:
 *   - `getAll()` returns a complete AppSettings object. Missing keys are
 *     filled with DEFAULT_SETTINGS so the caller always gets a full object.
 *   - `set(key, value)` validates the value with the per-key Zod schema,
 *     upserts the row, and returns the updated full settings.
 *   - Validation errors from Zod propagate as thrown exceptions, which the
 *     IPC handler catches and surfaces as error responses.
 */

import { getDrizzle } from '../db/drizzle';
import { settings } from '../db/schema';
import {
  DEFAULT_SETTINGS,
  parseSettingValue,
  type AppSettings,
  type SettingKey,
} from '../../shared/schemas/settings';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Load all rows from the settings table and materialise them into a typed
 * AppSettings, filling any absent keys with DEFAULT_SETTINGS values.
 */
export async function getAll(): Promise<AppSettings> {
  const db = getDrizzle();
  const rows = await db.select().from(settings);

  const result: AppSettings = { ...DEFAULT_SETTINGS };

  for (const row of rows) {
    const key = row.key as SettingKey;
    if (!(key in DEFAULT_SETTINGS)) continue; // ignore unknown keys

    try {
      const parsed = JSON.parse(row.value) as unknown;
      (result as Record<string, unknown>)[key] = parseSettingValue(key, parsed);
    } catch {
      // Corrupt / outdated value — keep the default.
    }
  }

  return result;
}

/**
 * Persist a single setting, validate it, and return the full updated settings
 * object. Throws a ZodError if `value` does not satisfy the key's schema.
 */
export async function set<K extends SettingKey>(
  key: K,
  value: unknown,
): Promise<AppSettings> {
  const parsed = parseSettingValue(key, value); // throws ZodError on bad input
  const db = getDrizzle();

  // SQLite upsert — INSERT OR REPLACE is safe here because `key` is the PK.
  await db
    .insert(settings)
    .values({ key, value: JSON.stringify(parsed) })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(parsed) },
    });

  // Re-load the full settings so the caller gets a consistent snapshot.
  return getAll();
}

// Convenience re-export for the IPC handler.
export const settingsService = { getAll, set };
