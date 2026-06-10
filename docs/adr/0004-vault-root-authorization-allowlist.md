# 0004. Authorize vault roots via a session allowlist, not a persisted path

Date: 2026-06-10  
Status: Accepted

---

## Context

The Obsidian vault import exposes two IPC channels — `vault:scan` and
`vault:import` — that take a `vaultPath` (a filesystem directory) in their
payload and read files beneath it. The renderer is untrusted; every IPC
payload is treated as hostile.

`safeVaultPath()` (in `vaultImporter.ts`) prevents a `relativePath` from
escaping the vault root via `../` traversal or symlinks. But it only
constrains the path *relative to* the root — it does nothing to validate the
root itself. A 2026-06 audit found `vaultPath` was an unvalidated renderer
string with no tie to the folder the user actually chose in
`vault:pickFolder`. A compromised renderer could therefore call:

```js
window.api.vault.scan({ vaultPath: '/Users/victim/.ssh', dailyNotesFolder: '' })
window.api.vault.import({ vaultPath: '/', noteRelativePaths: ['etc/passwd'], ... })
```

and read arbitrary files off disk into a note body, then read them back via
`notes.get` — the exact `fs`-read primitive the sandbox architecture exists to
deny. (`/` + `etc/passwd` reads `/etc/passwd`; containment relative to `/` is
meaningless.)

The fix has to anchor the root to a user action — the native folder picker —
without breaking the legitimate import/re-sync flow, which scans and imports
the same vault the user selected.

## Decision

Maintain an **in-memory, session-scoped allowlist** of canonicalised vault
roots the user has explicitly chosen, in `src/main/security/vault-access.ts`:

- `vault:pickFolder` calls `rememberAuthorizedVault()` with the native
  dialog's return value — the only place a path enters the set, and it can
  only come from a real user selection.
- `vault:scan` and `vault:import` call `assertAuthorizedVault(vaultPath)`
  after Zod validation and before any disk access. A path not in the set
  throws "Vault access denied".
- Paths are canonicalised with `realpathSync` (falling back to
  `path.resolve` on ENOENT) before being stored and before comparison, so
  `.`/`..` segments and macOS `/tmp → /private/tmp` symlinks cannot smuggle
  the same directory past an exact-string match in either direction.

The set is **not persisted**. A fresh app launch starts empty; the user must
re-pick the folder to scan or import again. This is acceptable because the
renderer flow (`VaultImportModal.tsx`) always calls `pickFolder()` at the
start of an import, and re-scan/import reuse the echoed `scanResult.vaultPath`,
which canonicalises to the same authorised root within the session.

`safeVaultPath()` is retained unchanged — the two checks are complementary:
`assertAuthorizedVault` validates the *root*, `safeVaultPath` validates each
*relative path* beneath it.

## Alternatives considered

| Option | Why not chosen |
|--------|---------------|
| Persist the last-used vault path to settings and allow it | The persisted value becomes state the renderer can influence over time; re-introduces a renderer-trusted root. A native dialog selection is unforgeable; a stored string is not. |
| Validate `vaultPath` is under a fixed safe prefix (e.g. `~/Documents`) | Users legitimately keep vaults anywhere (Dropbox, iCloud, external drives). A prefix allowlist breaks real use and still trusts a renderer-supplied path within the prefix. |
| Pass an opaque handle/token from `pickFolder` instead of a path | More machinery for no extra safety — the token would just key into the same server-side set. The path *is* the natural key once it's canonicalised and gated. |
| Do nothing; rely on `safeVaultPath` | `safeVaultPath` cannot constrain the root it is given; the audit confirmed the bypass is real and end-to-end exploitable. |

## Consequences

**Positive**
- Closes a HIGH-severity arbitrary-filesystem-read primitive: the renderer can
  no longer point vault IPC at a directory the user didn't select.
- Removes the most valuable target for the `openExternalSafe` exfiltration
  channel (an accepted residual risk), making that finding far less impactful.
- The invariant is unforgeable — the only entry point is the native dialog.

**Negative / watch points**
- The allowlist is session-scoped, so a future "background vault sync" or
  "re-import on startup" feature cannot silently reuse a previously chosen
  vault — it would need an explicit re-authorization (re-pick), or a
  deliberate, separately-reviewed persistence mechanism. This is intentional.
- **Any new IPC channel that accepts a filesystem root from the renderer must
  call `assertAuthorizedVault()` (or an equivalent gate) on that root.**
  `safeVaultPath()` alone is not sufficient — it does not validate the root.
  Captured as a "Known gotchas" entry in CLAUDE.md.

**Neutral**
- The set lives in main-process module state; cleared implicitly on quit. A
  `_resetAuthorizedVaults()` helper exists for test isolation only.
