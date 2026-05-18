import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { getDb } from './index';
import * as schema from './schema';

/**
 * Drizzle integration wired to @journeyapps/sqlcipher via sqlite-proxy.
 *
 * Per ADR-0001, @journeyapps/sqlcipher uses the node-sqlite3 callback API
 * which has no first-class Drizzle driver. `drizzle-orm/sqlite-proxy` lets
 * us provide an async executor function that translates between Drizzle's
 * call signature `(sql, params, method) => { rows }` and node-sqlite3's
 * `db.run / db.get / db.all` callbacks.
 *
 * Row shape translation: node-sqlite3 returns rows as objects keyed by
 * column name (`{ id: 'x', title: 'y' }`). The sqlite-proxy contract
 * requires rows as value-arrays (`['x', 'y']`) for `all` and `values`, or a
 * single value-array for `get`. We use `Object.values()` to project — this
 * relies on node-sqlite3 preserving SELECT column order in the returned
 * objects, which it does.
 */

export type DrizzleDb = SqliteRemoteDatabase<typeof schema>;

let _drizzle: DrizzleDb | null = null;

/**
 * Initialise the Drizzle wrapper. Must be called after `initDb()` has
 * resolved (so that `getDb()` returns a live sqlcipher connection).
 */
export function initDrizzle(): DrizzleDb {
  if (_drizzle !== null) return _drizzle;

  _drizzle = drizzle(
    async (sql, params, method) => {
      const db = getDb();

      return new Promise((resolve, reject) => {
        if (method === 'run') {
          db.run(sql, params, function (err: Error | null) {
            if (err) {
              reject(err);
              return;
            }
            resolve({ rows: [] });
          });
          return;
        }

        if (method === 'get') {
          db.get(sql, params, (err: Error | null, row: unknown) => {
            if (err) {
              reject(err);
              return;
            }
            // sqlite-proxy 'get' expects rows as a single flat value-array,
            // or an empty array if no row was found.
            resolve({
              rows: row ? Object.values(row as Record<string, unknown>) : [],
            });
          });
          return;
        }

        // 'all' or 'values' — both want rows as value-arrays per row.
        db.all(sql, params, (err: Error | null, rows: unknown[]) => {
          if (err) {
            reject(err);
            return;
          }
          resolve({
            rows: rows.map((r) => Object.values(r as Record<string, unknown>)),
          });
        });
      });
    },
    { schema },
  );

  return _drizzle;
}

/**
 * Return the Drizzle wrapper instance.
 * Throws if `initDrizzle()` has not yet been called.
 */
export function getDrizzle(): DrizzleDb {
  if (_drizzle === null) {
    throw new Error('Drizzle has not been initialised. Call initDrizzle() first.');
  }
  return _drizzle;
}
