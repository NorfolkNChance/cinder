import sqlite3 from '@journeyapps/sqlcipher';
import { app, safeStorage } from 'electron';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'fs';
import { join } from 'path';

// ── Key management ───────────────────────────────────────────────────────────

function getOrCreateDbKey(): string {
  const keyFilePath = join(app.getPath('userData'), 'db.key');

  if (existsSync(keyFilePath)) {
    const encryptedBlob = readFileSync(keyFilePath);
    return safeStorage.decryptString(encryptedBlob);
  }

  // First run: generate a 32-byte (256-bit) random key, encrypt it via
  // safeStorage (Keychain-backed) and write the encrypted blob to disk.
  const rawKey = randomBytes(32).toString('hex'); // 64 hex chars = raw 256-bit key
  const encryptedBlob = safeStorage.encryptString(rawKey);
  writeFileSync(keyFilePath, encryptedBlob);
  chmodSync(keyFilePath, 0o600); // owner read/write only
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
