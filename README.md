# Cinder

A local-first macOS notes-and-todos app. Markdown notes with WYSIWYG editing, a Todoist-equivalent todo system, and an Eisenhower matrix view — all in a hardened Electron shell.

> **Status:** feature-complete through Phase 5. All core functionality is working and tested. Not yet distributed — see [Development](#development) to run locally.

---

## Why another notes app

Most notes-and-todos products require you to send your content to someone else's server. Cinder is built on the opposite premise:

- **Local-first.** All your notes and tasks live in an encrypted SQLite database on your own machine. There is no account to sign up for and no server to talk to.
- **Security as a foundation, not a feature.** Every renderer is sandboxed, every IPC channel is validated, the database is encrypted at rest with a key stored only in the macOS Keychain. The full security model is documented in [`ARCHITECTURE.md`](./ARCHITECTURE.md) §3.
- **Designed for sync, shipping without it.** v1 has no cloud sync — sync is where security architectures usually collapse. The data model (UUIDv7 IDs, `updated_at`, soft deletes) is sync-friendly, so when sync arrives it will be CRDT-based with end-to-end encryption rather than naïve REST.

---

## What works today

### Notes
- **WYSIWYG Markdown editor** via TipTap (ProseMirror) with full keyboard support
- **Autosave** with a 500 ms debounce and explicit ⌘S flush
- **Full-text search** across titles and bodies (SQLite FTS5)
- **Local attachments** served via a custom `attachment://` protocol, pasted or dragged in
- **Drag-and-drop import** — drop `.md`, `.markdown`, `.html`, or `.htm` files directly into the sidebar or the empty state; HTML is converted to Markdown automatically via Turndown
- **Export** — export any note as a `.md` file, or all notes to a folder of `.md` files, via a native Save dialog

### Tasks
- **Full task CRUD** with title, description, priority (P1–P4), due date, and project assignment
- **Projects and sections** — hierarchical organisation with manual ordering
- **Labels** — cross-cutting tags, multiple per task
- **Recurring tasks** using RFC 5545 RRULE strings; completing a recurring task advances the due date automatically
- **Saved filters** with a typed DSL (`today & p1`, `@work & overdue`, `!done & upcoming`)
- **Natural-language quick-add** — type `"Submit report tomorrow at 5pm p1 @work"` and the parser extracts due date, priority, and labels
- **Inline editing** — double-click any task title, or press `e`, to edit title and description in place
- **Views** — Inbox (no project), Today (due today or overdue), Upcoming (future due dates), per-project, per-label, saved filter
- **Export tasks as CSV** with project, label, priority, and date columns

### Eisenhower Matrix
- **2×2 quadrant view** classifying all active tasks by urgency (due date window) and importance (priority cutoff) — both configurable
- **Drag tasks between quadrants** to update their priority and due date in a single drop; diagonal moves prompt for confirmation
- **Snapshot mode** — freeze the current layout to compare against a live view
- **Task detail panel** — click any card to open an inline editor for all fields
- **Project and label filters** — scope the matrix to a specific project or label

### ⌘K Command Palette
- Fuzzy-match search across all navigation targets, task scopes, projects, labels, saved filters, and actions
- Navigate to Notes, Tasks, or Matrix; jump to any project or label; create notes; open Help, Settings, or trigger exports — all from the keyboard

### Settings
- Persistent preferences stored in the encrypted database
- **Matrix:** urgency window (days ahead that count as urgent) and importance cutoff (which priorities are "important")
- **Tasks:** default scope on startup (Inbox / Today / Upcoming), show-completed toggle
- Changes take effect immediately; matrix updates live while the panel is open
- Open with ⌘, or the ⚙ button in the toolbar

### Export & Backup
- Export any single note as `.md`
- Export all notes to a folder (collision-safe filenames)
- Export all tasks as `.csv` (includes project, labels, priority, recurrence, dates)
- Full database backup as a `.db` snapshot
- All operations use native macOS Save/Open dialogs — the app never touches arbitrary file paths

### Auto-update
- Checks for updates automatically 10 seconds after launch (production builds only)
- Downloads in the background without interrupting work
- Slim banner appears when a download is in progress or an update is ready to install
- "Restart to apply" one-click install; "Check for updates" also available in Settings and the command palette

### Help
- Full in-app documentation covering every feature, searchable by keyword
- Open with ⌘/ or the `?` button; navigate sections with the keyboard

### Accessibility
- Focus is trapped inside all modals and returned to the opener on close
- Skip-to-main-content link for keyboard users
- ARIA landmarks, roles, and labels throughout (combobox, listbox, activedescendant, switch, region, list, current)
- All interactive elements reachable and operable by keyboard alone

---

## Tech stack

| Concern | Choice |
|---------|--------|
| Shell | Electron 41 (hardened runtime, sandboxed renderer) |
| UI | React 18, Tailwind CSS |
| State | Zustand (UI state), TanStack Query (server/IPC state) |
| Build | electron-vite + Vite + TypeScript (strict + `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| Database | SQLite (SQLCipher, AES-256) via [`@journeyapps/sqlcipher`](https://github.com/journeyapps/node-sqlcipher) — see [ADR-0001](./docs/adr/0001-sqlcipher-binding.md) |
| ORM | Drizzle (via `sqlite-proxy` adapter) |
| Editor | TipTap (ProseMirror) |
| Validation | Zod (schemas shared between main and renderer) |
| NLP | chrono-node (date parsing in quick-add) |
| Recurrence | rrule (RFC 5545 RRULE generation and advancement) |
| HTML import | Turndown (HTML → Markdown, sandboxed renderer, no Node required) |
| Auto-update | electron-updater (GitHub Releases) |
| Tests | Vitest, fast-check (property tests) |

---

## Development

### Prerequisites

- macOS (arm64 or x64)
- Node 24 (`nvm use 24`) — Electron 41 requires Node ≥ 22.12 at build time
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
| `npm test` | Vitest unit tests (279 tests across 15 suites) |
| `npm run release` | Production build + electron-builder publish to GitHub Releases (requires `GH_TOKEN`) |

For the signed and notarised release build pipeline, see [`docs/CI_CD_SETUP.md`](./docs/CI_CD_SETUP.md).

---

## Project layout

```
src/
  main/                     # Electron main process — trusted
    db/                     # schema, migrations, Drizzle wrapper
    ipc/                    # one file per domain (notes, tasks, export, settings, update, …)
    security/               # CSP, IPC sender verification, openExternal allow-list
    services/               # business logic
  preload/                  # contextBridge surface — the only path renderer → main
  renderer/                 # React app — sandboxed, no Node access
    features/               # notes/, tasks/, matrix/, export/, settings/, update/, …
    components/             # shared UI primitives (Toast, …)
    hooks/                  # useFocusTrap, useDebouncedCallback, …
    state/                  # Zustand stores
  shared/                   # framework-free; imported by both sides
    ipc/                    # channel name constants
    schemas/                # Zod input/output schemas
    matrix/                 # Eisenhower classification logic (pure, tested)
    filter/                 # DSL lexer, parser, compiler (pure, tested)
    recurrence/             # RRULE advancement helpers (pure, tested)
docs/
  adr/                      # Architecture Decision Records
ARCHITECTURE.md             # authoritative spec
CLAUDE.md                   # conventions and security rules for contributors
```

---

## Security

The renderer is treated as hostile. Every IPC channel is a public API and validated as such. The headline rules — all enforced either by ESLint or by Electron itself:

- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webviewTag: false`
- CSP set via response headers (not `<meta>` tags)
- Every IPC payload validated with Zod before reaching business logic
- `assertMainFrame()` check on every handler
- `shell.openExternal` gated behind an `https:`-only allow-list
- `eval`, `new Function`, `dangerouslySetInnerHTML` (outside the sanitisation wrapper), and Node built-ins in renderer code all rejected at lint time
- All file I/O (export, backup, attachment save) happens in the main process via native dialogs — the renderer never supplies or receives raw file paths

The full model is in [`ARCHITECTURE.md`](./ARCHITECTURE.md) §3.

If you find a security issue, please report it privately rather than opening a public issue.

---

## License

[MIT](./LICENSE).
