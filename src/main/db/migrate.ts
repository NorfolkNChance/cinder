import { getDb } from './index';

/**
 * Migration runner.
 *
 * Drizzle Kit generates numbered SQL files in `./migrations/`. Each file
 * contains one or more SQL statements separated by `--> statement-breakpoint`
 * markers. They must be applied in filename order, exactly once each.
 *
 * Strategy: inline all migration SQL into the bundle at build time via Vite's
 * `import.meta.glob('./migrations/*.sql', { query: '?raw', eager: true })`.
 * This avoids any filesystem reads at runtime — important because Electron's
 * packaged main process lives inside the asar bundle where directory layout
 * differs from development. Track applied migrations in a `_migrations` table
 * keyed on the filename (the leading number provides ordering).
 *
 * Each migration is applied inside a single transaction so a failed migration
 * leaves the database unchanged. A failure aborts the entire run.
 */

// Vite-only globbing call. At build time it expands to an object literal of
// { './migrations/0000_init.sql': 'CREATE TABLE...', ... }. At dev time
// (electron-vite dev) it is evaluated by Vite's SSR transform pipeline.
const rawMigrations = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

interface Migration {
  readonly name: string; // e.g. '0000_init'
  readonly statements: readonly string[];
}

/**
 * Parse the eagerly-imported migration map into a sorted list of Migration
 * objects with statements pre-split on Drizzle's statement-breakpoint marker.
 */
function loadMigrations(): readonly Migration[] {
  const entries = Object.entries(rawMigrations)
    .map(([path, sql]) => {
      const filename = path.split('/').pop() ?? path;
      const name = filename.replace(/\.sql$/, '');
      const statements = sql
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return { name, statements };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return entries;
}

function runStatement(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getDb().run(sql, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function ensureMigrationsTable(): Promise<void> {
  return runStatement(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name TEXT PRIMARY KEY NOT NULL,
       applied_at TEXT NOT NULL
     )`,
  );
}

function listApplied(): Promise<ReadonlySet<string>> {
  return new Promise((resolve, reject) => {
    getDb().all(
      'SELECT name FROM _migrations',
      (err: Error | null, rows: unknown[]) => {
        if (err) {
          reject(err);
          return;
        }
        const names = rows.map((r) => (r as { name: string }).name);
        resolve(new Set(names));
      },
    );
  });
}

async function applyMigration(migration: Migration): Promise<void> {
  await runStatement('BEGIN');
  try {
    for (const stmt of migration.statements) {
      await runStatement(stmt);
    }
    await runStatement(
      `INSERT INTO _migrations (name, applied_at) VALUES ('${migration.name}', '${new Date().toISOString()}')`,
    );
    await runStatement('COMMIT');
  } catch (err) {
    await runStatement('ROLLBACK').catch(() => {
      // ROLLBACK failure is logged but not surfaced — the original error is
      // the meaningful one.
    });
    throw err;
  }
}

/**
 * Apply any migrations that have not yet been recorded in `_migrations`.
 * Must be called after `initDb()` has resolved.
 *
 * Idempotent: calling repeatedly with no new migrations is a no-op.
 */
export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await listApplied();
  const migrations = loadMigrations();

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    await applyMigration(migration);
  }
}
