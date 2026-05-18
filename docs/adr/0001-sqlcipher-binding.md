# 0001. SQLCipher binding: `@journeyapps/sqlcipher`

Date: 2026-05-18  
Status: Accepted

---

## Context

The architecture (§3.5) mandates an encrypted SQLite database using SQLCipher with a 256-bit key managed via the macOS Keychain (`safeStorage`). The original plan specified `better-sqlite3-multiple-ciphers` as the binding, chosen for its synchronous API which simplifies IPC handler code.

During Phase 0 scaffolding two blockers emerged:

**1. ARM64 compiler flag rejection (`-maes`)**  
`better-sqlite3-multiple-ciphers@9.x` embeds an x86-specific AES-NI compiler flag (`-maes`) in its SQLCipher build. On Apple Silicon (arm64-apple-darwin), clang rejects this flag unconditionally, preventing compilation from source.

**2. V8 API break in Electron 42**  
Electron 42 ships a V8 version that changed `v8::External::New` to require an additional `ExternalPointerTypeTag` argument. `better-sqlite3` — the upstream package that `better-sqlite3-multiple-ciphers` wraps — calls the old two-argument form and has not yet been updated. `electron-rebuild` therefore fails for Electron 40+ regardless of the package version, blocking the project from using the current Electron release line.

The combination means: no prebuilt binaries for Node 24 on ARM64, and source compilation fails against both the system Node (ARM64 flag) and Electron 40+ (V8 API). Staying on Electron 35 worked but left the project on an out-of-support release line.

---

## Decision

Use **`@journeyapps/sqlcipher`** as the SQLCipher binding and target **Electron 41.x**.

`@journeyapps/sqlcipher` is a fork of `node-sqlite3` (rather than `better-sqlite3`) with SQLCipher compiled in. It:

- Ships prebuilt binaries for a wide range of Electron and Node versions, resolving via `node-pre-gyp` without requiring source compilation in normal operation.
- Is based on a different C++ codebase than `better-sqlite3` and does not make the `v8::External::New` call that breaks on Electron 40+.
- Has a long production track record (used in VS Code extensions and React Native apps).

The binding is wired via `@electron/rebuild` in the `postinstall` script to ensure the native `.node` binary is compiled against Electron's bundled Node headers, not the system Node.

**Key setup** is unchanged from the original design: a 256-bit key is generated with `crypto.randomBytes(32)`, encrypted with `safeStorage`, and written to `userData/db.key`. The key is applied as a raw hex value (`PRAGMA key = "x'...'"`) which bypasses the KDF entirely and feeds the 256-bit value directly to the AES-256 cipher. The following additional pragmas are set inside a `db.serialize()` block to guarantee sequential execution before any application queries:

```sql
PRAGMA key = "x'<64 hex chars>'"
PRAGMA cipher_page_size = 4096
PRAGMA kdf_iter = 256000
PRAGMA cipher_hmac_algorithm = HMAC_SHA512
PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA512
PRAGMA journal_mode = WAL
PRAGMA foreign_keys = ON
```

**API difference:** unlike `better-sqlite3`'s synchronous API, `@journeyapps/sqlcipher` is callback-based (matching `node-sqlite3`). The `initDb()` function wraps the open and pragma sequence in a `Promise` and is `await`ed in `app.whenReady()`. IPC handlers are already async (`ipcMain.handle`) so the change does not propagate further.

**Drizzle integration** (Phase 1): Drizzle ORM does not have a first-class driver for `node-sqlite3`. The integration will use `drizzle-orm/sqlite-proxy`, which accepts any async `(sql, params, method) => { rows }` executor. A thin promisified wrapper around the sqlcipher connection will satisfy this interface.

---

## Alternatives considered

### 1. Remain on `better-sqlite3-multiple-ciphers` with Electron 35

Electron 35.7.5 is compatible with `better-sqlite3-multiple-ciphers@12.9.0` and ARM64. This was the initial workaround. Rejected because:
- Electron 35 is outside the current support window (Electron supports only the three most recent stable major releases).
- The project would accumulate technical debt immediately at Phase 0, before a single feature is built.
- Security advisories flagging `electron <=39.x` would remain unresolved.

### 2. `better-sqlite3` (unencrypted) + application-layer column encryption

Use plain `better-sqlite3` — which has broad Electron support and no compilation issues — and encrypt sensitive columns in application code via Node's `crypto` module.

Rejected because:
- Encrypted columns are opaque blobs to SQLite; `WHERE`, `LIKE`, and FTS5 full-text search become impossible on encrypted content. The search feature (§6.1, §6.2) is a v1 requirement.
- The schema-level guarantee of SQLCipher ("every byte in the file is encrypted") is lost. Application-layer encryption requires careful, manually-audited decisions about which columns to encrypt and risks subtle omissions.
- Harder to retrofit to query-time encryption later without a migration.

### 3. `better-sqlite3` (unencrypted) + macOS FileVault / APFS volume encryption

Rely on OS-level disk encryption rather than a per-app cipher.

Rejected because:
- FileVault protects against physical theft with the machine powered off. It does not prevent a process running as the same user (e.g., a compromised dependency or another app) from reading the database.
- The architecture document explicitly calls SQLCipher a non-negotiable (§9 decision log: "Query-time encryption; OS-cache safe; battle-tested") and notes that OS-level encryption is insufficient.
- Difficult to add SQLCipher encryption to an existing unencrypted database without a migration that must handle partial failures.

### 4. SQLite WASM (`@sqlite.org/sqlite-wasm`)

A WebAssembly build of SQLite with no native compilation dependency.

Rejected because:
- No first-class Drizzle driver.
- SQLCipher compiled to WASM is not a packaged, maintained artefact; building it would require maintaining a custom WASM toolchain.
- The WASM API is async and would require significant adaptation.

### 5. Wait for `better-sqlite3` to support Electron 40+

The V8 API change is an upstream issue that `better-sqlite3` will need to address. Once it does, `better-sqlite3-multiple-ciphers` will follow.

Not rejected permanently — this remains the preferred long-term outcome. Rejected as the *current* decision because it offers no concrete timeline and leaves the project blocked on Electron 35 indefinitely.

---

## Consequences

**Positive**

- Electron 41.6.1 is a supported, current release. Security advisories against `electron <=39.x` no longer apply.
- No ARM64 compilation issues; prebuilt binaries resolve cleanly via `node-pre-gyp` + `electron-rebuild`.
- SQLCipher encryption is unchanged from the original design: same cipher (AES-256), same key management (`safeStorage`), same key strength (256-bit raw key).
- The `tar` vulnerabilities introduced by `@journeyapps/sqlcipher`'s build toolchain are mitigated via `npm overrides` pinning `tar` to `^7.5.15`.

**Negative / watch points**

- **Async API**: `initDb()` is now a `Promise`. All code that opens a DB connection must be in an async context. IPC handlers (`ipcMain.handle`) already are, so this is contained to the DB layer, but it must be remembered when adding new services.
- **Drizzle sqlite-proxy**: The Drizzle integration (Phase 1) requires the `sqlite-proxy` adapter rather than the simpler `better-sqlite3` driver. The proxy adds a small layer of indirection but is fully supported by Drizzle.
- **`@journeyapps/sqlcipher` maintenance pace**: The package is well-maintained but not as actively developed as `better-sqlite3`. If Electron 42+ support is eventually required, the package's prebuilt binary coverage should be checked before upgrading Electron.
- **Revisit when `better-sqlite3` catches up**: If `better-sqlite3` (and by extension `better-sqlite3-multiple-ciphers`) ships support for Electron 42+, the synchronous API is preferable for simplicity. At that point this decision should be revisited and a migration ADR written.
