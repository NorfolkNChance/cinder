import sqlite3 from '@journeyapps/sqlcipher';
import { app, dialog, safeStorage } from 'electron';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'fs';
import { join } from 'path';
import { parseKeyFileContent } from '../security/key-file';

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

/**
 * Encrypt a raw key via safeStorage (Keychain-backed) and write it to
 * `userData/db.key`, replacing any existing blob. Used on first run, when
 * the user imports an exported key file, and by the restore-from-backup
 * flow when a backup needs a different key than the current device key.
 */
export function writeDbKeyFile(rawKey: string): void {
  const keyFilePath = join(app.getPath('userData'), 'db.key');
  const encryptedBlob = safeStorage.encryptString(rawKey);
  writeFileSync(keyFilePath, encryptedBlob);
  chmodSync(keyFilePath, 0o600); // owner read/write only
}

/**
 * Boot-time recovery when the Keychain cannot decrypt `db.key`: offer to
 * import the key from an exported key file (Settings → Backup → "Export
 * encryption key…"). Runs before any window exists, so it uses the
 * synchronous dialog APIs.
 *
 * Returns the imported raw key, or null if the user gave up. The caller
 * persists it via writeDbKeyFile() so subsequent launches use the Keychain
 * path again; if the imported key doesn't actually match the database, the
 * initDb() probe query fails and boot surfaces that error instead.
 */
function promptImportKeyFile(cause: unknown): string | null {
  const intro = dialog.showMessageBoxSync({
    type: 'error',
    title: 'Cinder — Cannot Decrypt Database Key',
    message: 'The database encryption key could not be read from the macOS Keychain.',
    detail:
      'This can happen after a macOS password change, a migration to a new Mac, ' +
      'or if the Keychain entry was manually deleted.\n\n' +
      'If you exported your encryption key (Settings → Backup → "Export ' +
      'encryption key…"), you can import that file now to regain access to ' +
      'your notes and tasks.\n\n' +
      `Technical detail: ${cause instanceof Error ? cause.message : String(cause)}`,
    buttons: ['Import key file…', 'Quit'],
    defaultId: 0,
    cancelId: 1,
  });
  if (intro !== 0) return null;

  // Let the user retry after picking a wrong file — a typo'd choice here
  // must not force another full app relaunch.
  for (;;) {
    const filePaths = dialog.showOpenDialogSync({
      title: 'Import Encryption Key',
      filters: [{ name: 'Text File', extensions: ['txt'] }],
      properties: ['openFile'],
    });
    if (!filePaths || !filePaths[0]) return null;

    let key: string | null = null;
    try {
      key = parseKeyFileContent(readFileSync(filePaths[0], 'utf-8'));
    } catch {
      key = null;
    }
    if (key !== null) return key;

    const retry = dialog.showMessageBoxSync({
      type: 'error',
      title: 'Cinder — Invalid Key File',
      message: 'That file does not contain a Cinder encryption key.',
      detail:
        'Expected the file exported by "Export encryption key…" — it contains ' +
        'a line starting with "Key:" followed by 64 hexadecimal characters.',
      buttons: ['Choose another file…', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    });
    if (retry !== 0) return null;
  }
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
      // manual deletion of the Keychain entry. Offer to import an exported
      // key file; without one the encrypted database is unreadable, so the
      // only alternative is a clean exit rather than a silent crash.
      const imported = promptImportKeyFile(err);
      if (imported !== null) {
        writeDbKeyFile(imported);
        _dbKey = imported;
        return imported;
      }
      app.exit(1);
      // app.exit() is synchronous on macOS but TypeScript still needs a
      // return path — this line is never reached.
      throw new Error('unreachable');
    }
  }

  // First run: generate a 32-byte (256-bit) random key, encrypt it via
  // safeStorage (Keychain-backed) and write the encrypted blob to disk.
  const rawKey = randomBytes(32).toString('hex'); // 64 hex chars = raw 256-bit key
  writeDbKeyFile(rawKey);
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
 * Close the live database connection. Only the restore-from-backup flow
 * calls this — the app relaunches immediately after the file swap, so no
 * attempt is made to make the service layer survive a closed handle
 * (queries in the gap fail fast via the getDb() guard above).
 */
export function closeDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (_db === null) {
      resolve();
      return;
    }
    _db.close((err: Error | null) => {
      if (err) {
        reject(err);
        return;
      }
      _db = null;
      resolve();
    });
  });
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
