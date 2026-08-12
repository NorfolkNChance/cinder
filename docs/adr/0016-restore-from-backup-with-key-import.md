# 0016. Restore from backup with key-file import, entirely in the main process

Date: 2026-08-12  
Status: Accepted

---

## Context

Cinder had comprehensive backup machinery — `VACUUM INTO` snapshots,
auto-backup on quit with rotation, encryption-key export — and no restore
path at all. Recovery meant manual file surgery in
`~/Library/Application Support/Cinder/`, and the cross-Mac case was
effectively impossible for a user: the DB key is `safeStorage`-encrypted,
which is Keychain-scoped to the original Mac, and although the key could be
*exported*, nothing could import it. Worse, both boot-failure paths (Keychain
decrypt failure; corrupt DB) dead-ended in an error box with no action.

An untested, undocumented restore path means the backups were not actually
delivering their promise.

## Decision

Add a main-process-only interactive restore flow (`services/restore.ts`),
reachable from three places: Settings → Backup ("Restore from backup…" via
the `restore:fromBackup` IPC channel), the boot dialog when the DB cannot be
opened, and the boot dialog when the integrity check fails.

Flow, in order, with nothing touched until all validation passes:

1. **Pick the backup** (native open dialog, defaulting to the auto-backup
   folder).
2. **Decrypt** — try the current device key first; if it doesn't fit, ask
   for the **exported key file** (`Key: <64 hex>` format, parsed by
   `security/key-file.ts`). The key is never typed and never crosses IPC.
3. **Validate** — schema probe, `PRAGMA integrity_check`, and a
   **migration-compat guard**: if the backup's `_migrations` table names a
   migration this build doesn't know, it's from a newer Cinder and is
   refused (an older backup is fine — pending migrations run at next boot).
4. **Confirm** with note/task counts shown.
5. **Safety-snapshot the current DB** into `userData/backups/` —
   `VACUUM INTO` when the live DB is healthy, raw file copies (including
   WAL/SHM, for forensics) when it isn't.
6. **Swap**: close the handle, delete stale `-wal`/`-shm`, copy the backup
   into place, and — if a different key was used — persist it via
   `writeDbKeyFile()` so it becomes the device key.
7. **`app.relaunch(); app.exit(0)`** — `app.exit` deliberately skips
   `will-quit`, so the auto-backup hook never runs against the swapped file.

Additionally, the boot-time Keychain-decrypt failure now offers **"Import
key file…"** (synchronous dialogs, pre-window), covering the "DB file intact
but Keychain lost" migration case without needing a backup at all.

## Alternatives considered

| Option | Why not chosen |
|--------|---------------|
| Renderer-side restore UI (file paths + key field in Settings) | Violates the standing rule that key material and filesystem paths never touch the renderer; a text field for a key invites clipboard/keylogger exposure and typos. Native dialogs already have OS-level trust. |
| Re-key the restored DB to the existing device key (`PRAGMA rekey`) instead of adopting the imported key | Rekey mutates the only copy mid-flow; a crash mid-rekey loses everything. Adopting the imported key is a metadata write with no data mutation. |
| Hot-swap without relaunch (re-open DB, invalidate renderer caches) | Every service, the MCP server, Drizzle, and TanStack Query would need coordinated reset; the failure modes are endless. A relaunch is honest and takes two seconds. |
| Version guard via `PRAGMA user_version` | The codebase doesn't maintain user_version; `_migrations` names are already the authoritative schema record and need no new bookkeeping. |

## Consequences

**Positive**
- Every backup the app produces is now provably restorable in-app, including
  on a different Mac (backup file + exported key file are sufficient).
- Both boot dead-ends became recovery flows; corruption recovery no longer
  requires Finder archaeology.
- A restore is itself undoable via the pre-restore safety snapshot.

**Negative / watch points**
- The cipher pragma set (`cipher_page_size`, `kdf_iter`, HMAC/KDF
  algorithms) is duplicated between `initDb()` and the restore's
  `openBackupReadonly()`. **If those pragmas ever change, change both** —
  and note that older backups written with the old parameters would then
  need a compat path.
- `restoreFromBackup()` is dialog-driven and not unit-testable end-to-end;
  the pure pieces (`parseKeyFileContent`, `findUnknownMigrations`) carry
  the tests. The smoke test covers the boot wiring.
- After `closeDb()`, any in-flight IPC/MCP query fails until the relaunch
  (window of a few hundred ms). Accepted; the alternative is a full
  service-layer shutdown sequence.

**Neutral**
- `restore:*` is its own IPC domain (one file per domain), mirroring the
  export domain's "renderer only pulls the trigger" shape.
