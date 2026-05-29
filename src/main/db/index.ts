import sqlite3 from '@journeyapps/sqlcipher';
import { app, dialog, safeStorage } from 'electron';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'fs';
import { join } from 'path';

// ── Key management ───────────────────────────────────────────────────────────

/** The decrypted DB key, cached once after `initDb()` resolves. */
let _dbKey: string | null = null;

/**
 * Return the in-memory copy of the database encryption key.
 * Throws if called before `initDb()` has resolved.
 */
export function getDbKey(): string {
  if (_dbKey === null) {
    throw new Error('Database key not available. Await initDb() first.');
  }
  return _dbKey;
}

function getOrCreateDbKey(): string {
  const keyFilePath = join(app.getPath('userData'), 'db.key');

  if (existsSync(keyFilePath)) {
    const encryptedBlob = readFileSync(keyFilePath);
    try {
      const decrypted = safeStorage.decryptString(encryptedBlob);
      _dbKey = decrypted;
      return decrypted;
    } catch (err) {
      // safeStorage.decryptString throws when the macOS Keychain is
      // inaccessible — e.g. after a password change, data migration, or
      // manual deletion of the Keychain entry. Without the key the encrypted
      // database is unreadable, so we surface a clear error and exit rather
      // than crashing silently with an unhandled rejection.
      dialog.showErrorBox(
        'Cinder — Cannot Decrypt Database Key',
        'The database encryption key could not be read from the macOS Keychain.\n\n' +
          'This can happen after a macOS password change, a migration to a new Mac, ' +
          'or if the Keychain entry was manually deleted.\n\n' +
          'Your notes and tasks cannot be accessed without the original key. ' +
          'Restore the Keychain entry or replace the database with a backup.\n\n' +
          `Technical detail: ${err instanceof Error ? err.message : String(err)}`,
      );
      app.exit(1);
      // app.exit() is synchronous on macOS but TypeScript still needs a
      // return path — this line is never reached.
      throw new Error('unreachable');
    }
  }

  // First run: generate a 32-byte (256-bit) random key, encrypt it via
  // safeStorage (Keychain-backed) and write the encrypted blob to disk.
  const rawKey = randomBytes(32).toString('hex'); // 64 hex chars = raw 256-bit key
  const encryptedBlob = safeStorage.encryptString(rawKey);
  writeFileSync(keyFilePath, encryptedBlob);
  chmodSync(keyFilePath, 0o600); // owner read/write only
  _dbKey = rawKey;
  return rawKey;
}

// ── Database initialisation ──────────────────────────────────────────────────

let _db: sqlite3.Database | null = null;

/**
 * Open the encrypted SQLite database and apply the SQLCipher key.
 *
 * Uses db.serialize() to guarantee the PRAGMA sequence runs before any
 * application queries. Resolves once a probe query confirms the key is
 * accepted; rejects if the database cannot be opened or the key is wrong.
 *
 * Must be called once from app.whenReady() before getDb() is used.
 */
export function initDb(): Promise<void> {
  if (_db !== null) return Promise.resolve();

  const dbPath = join(app.getPath('userData'), 'cinder.db');
  const key = getOrCreateDbKey();

  return new Promise<void>((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (openErr) => {
      if (openErr) {
        reject(openErr);
        return;
      }

      // serialize() guarantees sequential execution — essential for the key
      // pragma which must be the very first statement issued to SQLCipher.
      db.serialize(() => {
        // Raw-key form: "x'<64 hex chars>'" skips the KDF entirely and feeds
        // the 256-bit value directly to SQLCipher's AES-256 cipher.
        db.run(`PRAGMA key = "x'${key}'"`)
          .run('PRAGMA cipher_page_size = 4096')
          .run('PRAGMA kdf_iter = 256000')
          .run('PRAGMA cipher_hmac_algorithm = HMAC_SHA512')
          .run('PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA512')
          .run('PRAGMA journal_mode = WAL')
          .run('PRAGMA foreign_keys = ON')
          // Probe query: if the key was wrong the schema read will error.
          .get('SELECT count(*) FROM sqlite_master', (probeErr: Error | null) => {
            if (probeErr) {
              reject(new Error(`SQLCipher key rejected or DB corrupt: ${probeErr.message}`));
              return;
            }
            _db = db;
            resolve();
          });
      });
    });
  });
}

/**
 * Return the open database instance.
 * Throws if initDb() has not been awaited first.
 */
export function getDb(): sqlite3.Database {
  if (_db === null) {
    throw new Error('Database has not been initialised. Await initDb() first.');
  }
  return _db;
}

/**
 * Run SQLite's built-in integrity check on the open database.
 * Returns `true` if the database is healthy, `false` if any problem is found.
 * Should be called after `initDb()` has resolved.
 *
 * Runs `PRAGMA integrity_check` which scans b-tree pages, free-list pages,
 * and index consistency. Returns 'ok' for a healthy database; otherwise
 * returns a list of error strings (we treat any non-ok result as failure).
 */
export function runIntegrityCheck(): Promise<boolean> {
  return new Promise((resolve) => {
    getDb().get(
      'PRAGMA integrity_check',
      (err: Error | null, row: unknown) => {
        if (err) {
          resolve(false);
          return;
        }
        const val = (row as Record<string, unknown> | undefined)?.['integrity_check'];
        resolve(val === 'ok');
      },
    );
  });
}
