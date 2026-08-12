import sqlite3 from '@journeyapps/sqlcipher';
import { app, dialog } from 'electron';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'fs';
import { basename, join } from 'path';
import { closeDb, getDb, getDbKey, writeDbKeyFile } from '../db/index';
import { findUnknownMigrations, knownMigrationNames } from '../db/migrate';
import { parseKeyFileContent } from '../security/key-file';
import { vacuumInto } from './export';
import type { RestoreResult } from '../../shared/schemas/restore';

/**
 * Restore-from-backup service.
 *
 * The counterpart to exportBackup()/exportKeyBackup(): picks a backup .db,
 * proves it can be decrypted and is healthy, then swaps it in as the live
 * database and relaunches the app.
 *
 * Security / integrity properties:
 *   - Entirely main-process. The renderer triggers the flow; every choice
 *     happens in native dialogs. Neither file paths nor key material cross
 *     the IPC boundary.
 *   - The backup is validated BEFORE anything is touched: the candidate key
 *     must decrypt it (probe query), `PRAGMA integrity_check` must pass,
 *     and its `_migrations` table must not contain migrations unknown to
 *     this build (a backup from a newer Cinder is refused — restoring it
 *     would hand current code a schema it doesn't understand). A backup
 *     from an OLDER version is fine: pending migrations run at next boot.
 *   - A key that isn't the current device key is supplied by picking the
 *     exported key file (Settings → Backup → "Export encryption key…") —
 *     never typed into the renderer. On success it becomes the device key
 *     (safeStorage-encrypted into userData/db.key), which is exactly the
 *     new-Mac migration path.
 *   - The current database is snapshotted into userData/backups/ before
 *     the swap (VACUUM INTO when it's open and healthy; a raw file copy
 *     as a forensic fallback when it isn't), so a restore is itself
 *     recoverable.
 *   - The app relaunches immediately after the swap — no code path runs
 *     against the restored file with stale in-memory state.
 */

/** Pragma bootstrap shared with initDb() — key first, then cipher params. */
function applyCipherPragmas(db: sqlite3.Database, key: string): void {
  db.run(`PRAGMA key = "x'${key}'"`)
    .run('PRAGMA cipher_page_size = 4096')
    .run('PRAGMA kdf_iter = 256000')
    .run('PRAGMA cipher_hmac_algorithm = HMAC_SHA512')
    .run('PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA512');
}

/**
 * Open a backup read-only and verify the key decrypts it (schema probe).
 * Resolves with the open handle; rejects (with the handle closed) when the
 * file can't be opened or the key is wrong.
 */
function openBackupReadonly(
  path: string,
  key: string,
): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(path, sqlite3.OPEN_READONLY, (openErr) => {
      if (openErr) {
        reject(openErr);
        return;
      }
      db.serialize(() => {
        applyCipherPragmas(db, key);
        db.get('SELECT count(*) FROM sqlite_master', (probeErr: Error | null) => {
          if (probeErr) {
            db.close(() => reject(probeErr));
            return;
          }
          resolve(db);
        });
      });
    });
  });
}

function closeQuietly(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve) => db.close(() => resolve()));
}

/** `PRAGMA integrity_check` on an already-open handle. */
function integrityCheck(db: sqlite3.Database): Promise<boolean> {
  return new Promise((resolve) => {
    db.get('PRAGMA integrity_check', (err: Error | null, row: unknown) => {
      if (err) {
        resolve(false);
        return;
      }
      const val = (row as Record<string, unknown> | undefined)?.['integrity_check'];
      resolve(val === 'ok');
    });
  });
}

/**
 * Names recorded in the backup's `_migrations` table. A missing table
 * (pre-first-migration or ancient backup) resolves to [] — that's an older
 * schema, which is restorable.
 */
function readBackupMigrations(db: sqlite3.Database): Promise<readonly string[]> {
  return new Promise((resolve) => {
    db.all('SELECT name FROM _migrations', (err: Error | null, rows: unknown[]) => {
      if (err) {
        resolve([]);
        return;
      }
      resolve(rows.map((r) => (r as { name: string }).name));
    });
  });
}

/** Best-effort content summary for the confirmation dialog. */
function countRows(db: sqlite3.Database, table: 'notes' | 'tasks'): Promise<number | null> {
  return new Promise((resolve) => {
    db.get(
      `SELECT count(*) AS n FROM ${table} WHERE deleted_at IS NULL`,
      (err: Error | null, row: unknown) => {
        if (err) {
          resolve(null);
          return;
        }
        resolve((row as { n: number } | undefined)?.n ?? null);
      },
    );
  });
}

/**
 * Ask for the exported key file and parse it. Returns the key, or null if
 * the user cancelled. Loops on unparseable files.
 */
async function promptKeyFile(): Promise<string | null> {
  for (;;) {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Choose Encryption Key File',
      filters: [{ name: 'Text File', extensions: ['txt'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths[0]) return null;

    let key: string | null = null;
    try {
      key = parseKeyFileContent(readFileSync(filePaths[0], 'utf-8'));
    } catch {
      key = null;
    }
    if (key !== null) return key;

    const { response } = await dialog.showMessageBox({
      type: 'error',
      title: 'Invalid Key File',
      message: 'That file does not contain a Cinder encryption key.',
      detail:
        'Expected the file exported by "Export encryption key…" — it contains ' +
        'a line starting with "Key:" followed by 64 hexadecimal characters.',
      buttons: ['Choose another file…', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return null;
  }
}

function errorResult(message: string): RestoreResult {
  return { success: false, reason: 'error', message };
}

const CANCELLED: RestoreResult = { success: false, reason: 'cancelled' };

/** Re-entrancy guard — a second invoke while dialogs are up is a no-op. */
let _restoring = false;

export interface RestoreOptions {
  /**
   * Whether the live DB is open and healthy enough for VACUUM INTO. The
   * boot-failure paths pass false, which switches the pre-restore safety
   * snapshot to a raw file copy.
   */
  readonly liveDbAvailable: boolean;
}

export async function restoreFromBackup(
  opts: RestoreOptions = { liveDbAvailable: true },
): Promise<RestoreResult> {
  if (_restoring) return CANCELLED;
  _restoring = true;
  try {
    return await runRestoreFlow(opts);
  } finally {
    _restoring = false;
  }
}

async function runRestoreFlow(opts: RestoreOptions): Promise<RestoreResult> {
  const userData = app.getPath('userData');
  const backupsDir = join(userData, 'backups');

  // ── 1. Pick the backup file ────────────────────────────────────────────────
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: 'Restore from Backup',
    // Auto-backups live in userData/backups — surface them by default;
    // manual backups default to Documents at export time.
    defaultPath: existsSync(backupsDir) ? backupsDir : app.getPath('documents'),
    filters: [{ name: 'Cinder Database', extensions: ['db'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return CANCELLED;
  const backupPath = filePaths[0];

  const dbPath = join(userData, 'cinder.db');
  if (backupPath === dbPath) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Restore from Backup',
      message: 'That is the live database, not a backup.',
      detail: 'Choose a backup file created with "Back up now…" or an auto-backup.',
      buttons: ['OK'],
    });
    return errorResult('Selected the live database file.');
  }

  // ── 2. Decrypt: current device key first, exported key file as fallback ───
  let currentKey: string | null = null;
  try {
    currentKey = getDbKey();
  } catch {
    currentKey = null; // boot-failure context — key may be unavailable
  }

  let backupDb: sqlite3.Database | null = null;
  let usedKey: string | null = null;

  if (currentKey !== null) {
    try {
      backupDb = await openBackupReadonly(backupPath, currentKey);
      usedKey = currentKey;
    } catch {
      backupDb = null; // wrong key for this backup — fall through to key file
    }
  }

  if (backupDb === null) {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Restore from Backup',
      message: 'This backup needs its encryption key.',
      detail:
        'The backup could not be decrypted with the key stored on this Mac. ' +
        'It was probably created on another Mac or with an older key.\n\n' +
        'Choose the key file you exported with "Export encryption key…" to ' +
        'continue. After the restore, that key becomes this Mac’s key.',
      buttons: ['Choose key file…', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return CANCELLED;

    const importedKey = await promptKeyFile();
    if (importedKey === null) return CANCELLED;

    try {
      backupDb = await openBackupReadonly(backupPath, importedKey);
      usedKey = importedKey;
    } catch {
      await dialog.showMessageBox({
        type: 'error',
        title: 'Restore from Backup',
        message: 'That key does not match this backup.',
        detail:
          'The backup could not be decrypted with the chosen key file. ' +
          'Check that the key file and the backup belong to the same Cinder ' +
          'installation.',
        buttons: ['OK'],
      });
      return errorResult('Key file does not decrypt the chosen backup.');
    }
  }

  // ── 3. Validate the decrypted backup ───────────────────────────────────────
  try {
    const healthy = await integrityCheck(backupDb);
    if (!healthy) {
      await dialog.showMessageBox({
        type: 'error',
        title: 'Restore from Backup',
        message: 'This backup file is damaged.',
        detail:
          'The backup failed SQLite’s integrity check and cannot be ' +
          'restored safely. Try a different backup.',
        buttons: ['OK'],
      });
      return errorResult('Backup failed integrity check.');
    }

    const unknown = findUnknownMigrations(
      await readBackupMigrations(backupDb),
      knownMigrationNames(),
    );
    if (unknown.length > 0) {
      await dialog.showMessageBox({
        type: 'error',
        title: 'Restore from Backup',
        message: 'This backup was created by a newer version of Cinder.',
        detail:
          'Update Cinder to the latest version, then restore this backup.\n\n' +
          `Unknown schema migrations: ${unknown.join(', ')}`,
        buttons: ['OK'],
      });
      return errorResult('Backup schema is newer than this app version.');
    }

    // ── 4. Confirm ───────────────────────────────────────────────────────────
    const noteCount = await countRows(backupDb, 'notes');
    const taskCount = await countRows(backupDb, 'tasks');
    const contents =
      noteCount !== null && taskCount !== null
        ? `It contains ${noteCount} note(s) and ${taskCount} task(s).\n\n`
        : '';

    const { response: confirm } = await dialog.showMessageBox({
      type: 'warning',
      title: 'Restore from Backup',
      message: 'Replace your current data with this backup?',
      detail:
        `Backup: ${basename(backupPath)}\n\n` +
        contents +
        'Your current database will be saved as a safety copy in the ' +
        'auto-backup folder first. Cinder will then relaunch with the ' +
        'restored data.',
      buttons: ['Cancel', 'Restore and Relaunch'],
      defaultId: 0,
      cancelId: 0,
    });
    if (confirm !== 1) return CANCELLED;
  } finally {
    await closeQuietly(backupDb);
  }

  // ── 5. Safety snapshot of the current database ─────────────────────────────
  mkdirSync(backupsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  try {
    if (opts.liveDbAvailable) {
      getDb(); // throws if not actually open
      await vacuumInto(join(backupsDir, `pre-restore-${ts}.db`));
    } else if (existsSync(dbPath)) {
      // The live DB is corrupt or unopenable — keep raw copies (including
      // WAL/SHM) for forensics rather than losing the evidence in the swap.
      copyFileSync(dbPath, join(backupsDir, `pre-restore-raw-${ts}.db`));
      for (const suffix of ['-wal', '-shm']) {
        if (existsSync(dbPath + suffix)) {
          copyFileSync(
            dbPath + suffix,
            join(backupsDir, `pre-restore-raw-${ts}.db${suffix}`),
          );
        }
      }
    }
  } catch (err) {
    // The snapshot is best-effort by design: the user explicitly chose to
    // replace this data, and the failure mode (e.g. corrupt source refusing
    // VACUUM) is exactly when a restore is most needed.
    console.error('[cinder] pre-restore safety snapshot failed:', err);
  }

  // ── 6. Swap ────────────────────────────────────────────────────────────────
  try {
    await closeDb().catch((err: unknown) => {
      // A close failure must not strand the user mid-restore; the relaunch
      // discards this process (and its handle) either way.
      console.error('[cinder] closeDb before restore failed:', err);
    });

    // Stale WAL/SHM from the old database must not be replayed into the
    // restored file — a VACUUM INTO backup is self-contained by definition.
    for (const suffix of ['-wal', '-shm']) {
      rmSync(dbPath + suffix, { force: true });
    }
    copyFileSync(backupPath, dbPath);

    // The key that decrypted the backup becomes the device key. No-op when
    // it already was; the new-Mac path persists the imported key into the
    // Keychain-backed db.key so next boot decrypts normally.
    if (usedKey !== null && usedKey !== currentKey) {
      writeDbKeyFile(usedKey);
    }
  } catch (err) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Restore from Backup',
      message: 'The restore could not be completed.',
      detail:
        `Copying the backup into place failed: ${err instanceof Error ? err.message : String(err)}\n\n` +
        'Your previous database file has not been deleted. Quit and relaunch ' +
        'Cinder; if it does not start, contact support via the GitHub issues page.',
      buttons: ['OK'],
    });
    return errorResult('File swap failed.');
  }

  // ── 7. Relaunch onto the restored database ─────────────────────────────────
  // app.exit() skips will-quit deliberately: the auto-backup hook must not
  // run against a closed handle / freshly-swapped file.
  app.relaunch();
  app.exit(0);
  return { success: true };
}
