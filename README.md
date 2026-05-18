# Cinder

A local-first macOS notes-and-todos app. Markdown notes with WYSIWYG editing, a Todoist-equivalent todo system, and an Eisenhower matrix view — all in a hardened Electron shell.

> **Status:** under active development. Phase 1 (notes editor and CRUD) is in progress. Not yet a usable product.

---

## Why another notes app

Most notes-and-todos products require you to send your content to someone else's server. Cinder is built on the opposite premise:

- **Local-first.** All your notes and tasks live in an encrypted SQLite database on your own machine. There is no account to sign up for and no server to talk to.
- **Security as a foundation, not a feature.** Every renderer is sandboxed, every IPC channel is validated, the database is encrypted at rest with a key stored only in the macOS Keychain. The full security model is documented in [`ARCHITECTURE.md`](./ARCHITECTURE.md) §3.
- **Designed for sync, shipping without it.** v1 has no cloud sync — sync is where security architectures usually collapse. The data model (UUIDv7 IDs, `updated_at`, soft deletes) is sync-friendly, so when sync arrives it will be CRDT-based with end-to-end encryption rather than naïve REST.

## What's planned

From the [architecture spec](./ARCHITECTURE.md):

**Notes**
- Markdown as canonical storage, edited via a TipTap WYSIWYG editor
- Floating bubble menu, slash command menu, source-mode toggle
- Local attachments via a custom `attachment://` protocol
- Full-text search across titles and bodies (SQLite FTS5)

**Todos**
- Projects, sections, subtasks, labels, priorities (P1–P4), due dates, recurring tasks (RFC 5545 RRULE)
- Natural-language quick-add (`"Submit report tomorrow at 5pm p1 @work #inbox"`)
- Saved filters with a small DSL (`today & p1`, `@work & overdue`)
- ⌘K command palette, vim-style keyboard shortcuts

**Eisenhower matrix**
- A 2×2 view derived from task priority and due date — drag tasks between quadrants to update both at once

## What works today

Phase 0 (the hardened shell) is complete:

- Electron + React + TypeScript with every security setting from §3 in place
- Encrypted SQLite (SQLCipher, AES-256) with the database key generated on first run and stored in the macOS Keychain via `safeStorage`
- Schema migrations via Drizzle + a build-time-inlined migration runner
- Typed IPC pattern with Zod validation at the main-process boundary
- ESLint rules that fail the build on forbidden patterns (`eval`, `dangerouslySetInnerHTML` outside a sanitisation wrapper, `ipcRenderer` outside `src/preload`, Node built-ins in renderer code, etc.)

Phase 1 in progress.

## Tech stack

| Concern | Choice |
|---------|--------|
| Shell | Electron 41 (hardened runtime, sandboxed renderer) |
| UI | React 18, Tailwind CSS, Radix UI primitives |
| Build | electron-vite + Vite + TypeScript (strict, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| Database | SQLite (SQLCipher) via [`@journeyapps/sqlcipher`](https://github.com/journeyapps/node-sqlcipher) — see [ADR-0001](./docs/adr/0001-sqlcipher-binding.md) for the binding decision |
| ORM | Drizzle (via `sqlite-proxy` adapter) |
| Editor | TipTap (ProseMirror) |
| Validation | Zod (schemas shared between main and renderer) |
| Tests | Vitest, Playwright (planned), fast-check for property tests |

## Development

### Prerequisites

- macOS (arm64 or x64)
- Node 24 (`nvm use 24`) — Electron 41 requires Node ≥22.12 at build time
- Python 3 (for occasional native-module rebuilds)

### Setup

```sh
git clone https://github.com/<your-fork>/cinder.git
cd cinder
npm ci
```

`npm ci` runs `electron-rebuild` automatically (via `postinstall`), which compiles `@journeyapps/sqlcipher` against Electron's bundled Node headers.

### Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the electron-vite dev server and launch the Electron app with HMR |
| `npm run build` | Production build (main, preload, renderer) — does not sign |
| `npm run typecheck` | `tsc --noEmit` against both the main and renderer tsconfigs |
| `npm run lint` | ESLint flat config (security rules + TypeScript rules) |
| `npm test` | Vitest unit tests |

For the signed and notarised release build pipeline, see [`docs/CI_CD_SETUP.md`](./docs/CI_CD_SETUP.md).

## Project layout

```
src/
  main/                     # Electron main process — trusted
    db/                     # schema, migrations, Drizzle wrapper
    ipc/                    # one file per domain
    security/               # CSP, IPC sender verification, openExternal allow-list
    services/               # business logic
  preload/                  # contextBridge surface — the only path renderer → main
  renderer/                 # React app — sandboxed, no Node access
  shared/                   # framework-free; imported by both sides
    ipc/                    # channel name constants
    schemas/                # Zod input schemas
    types/                  # derived TypeScript types
docs/
  adr/                      # Architecture Decision Records
ARCHITECTURE.md             # authoritative spec
CLAUDE.md                   # conventions and security rules for contributors
```

## Security

The renderer is treated as hostile. Every IPC channel is a public API and validated as such. The headline rules — all enforced either by ESLint or by Electron itself:

- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webviewTag: false`
- CSP set via response headers (not `<meta>` tags)
- Every IPC payload validated with Zod before reaching business logic
- `assertMainFrame()` check on every handler
- `shell.openExternal` gated behind an `https:`-only allow-list
- `eval`, `new Function`, `dangerouslySetInnerHTML` (outside the sanitisation wrapper), and Node built-ins in renderer code all rejected at lint time

The full model is in [`ARCHITECTURE.md`](./ARCHITECTURE.md) §3. Phase 0 included an explicit security review against that section before any feature work began.

If you find a security issue, please report it privately rather than opening a public issue.

## License

[MIT](./LICENSE).
