# CLAUDE.md — Cinder

Local-first macOS notes-and-todos app. Electron + React. **Security is foundational, not a feature.**

Full architectural spec: [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — read it before making structural decisions.

---

## Commands

```sh
npm run dev          # start electron-vite dev server + Electron
npm run build        # production build
npm run typecheck    # tsc strict check (main + renderer)
npm run lint         # eslint flat config
npm run test         # vitest unit tests
```

---

## Process model

| Process  | Trust      | Key constraint                                      |
|----------|------------|-----------------------------------------------------|
| Main     | Trusted    | All DB, IPC, keychain, filesystem access lives here |
| Preload  | Bridge     | `contextBridge` only — no Node primitives exposed   |
| Renderer | Untrusted  | Sandboxed. No `fs`, no `require`, no Node at all    |

**Treat the renderer as hostile.** Every IPC channel is a public API.

---

## Security rules — non-negotiable

These are enforced by ESLint and must never regress.

1. **`BrowserWindow` options** — `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webviewTag: false`. All options as set in `src/main/index.ts`. No exceptions, no overrides.

2. **CSP** is set via `session.webRequest.onHeadersReceived` in `src/main/security/csp.ts`, never via `<meta>` tags.

3. **IPC discipline**:
   - No generic IPC bridges (`invoke(channel, ...args)` is forbidden). One file per domain in `src/main/ipc/`.
   - All payloads validated with Zod at the handler boundary before any business logic.
   - Every handler calls `assertMainFrame(event)` from `src/main/security/ipc-guard.ts`.
   - No `ipcRenderer.sendSync`. No `remote` module.
   - `ipcRenderer` is only used inside `src/preload/`.

4. **`eval`, `new Function`, `setTimeout`/`setInterval` with string args** — banned. ESLint enforces this.

5. **`dangerouslySetInnerHTML`** — forbidden outside a component explicitly named `*SanitizedHtml` or `*SafeHtml`. ESLint enforces this.

6. **`shell.openExternal`** — only via `openExternalSafe()` in `src/main/security/open-external-safe.ts`. Allows `https:` only.

7. **Node built-ins** (`fs`, `child_process`, `net`, `path`, `crypto`) must never be imported in renderer code. Architecturally impossible with `sandbox: true`, but ESLint catches it at the source.

---

## Adding a new IPC channel

Follow this pattern for every new domain:

```ts
// src/shared/ipc/channels.ts
export const NOTES_CREATE = 'notes:create';

// src/shared/schemas/notes.ts
export const NoteCreateInput = z.object({ ... });

// src/main/ipc/notes.ts
ipcMain.handle(NOTES_CREATE, async (event, raw) => {
  assertMainFrame(event);
  const input = NoteCreateInput.parse(raw);
  return notesService.create(input);
});

// src/preload/index.ts — add to contextBridge
notes: {
  create: (input: NoteCreateInput) => ipcRenderer.invoke(NOTES_CREATE, input),
}
```

---

## Database

- **Engine**: `better-sqlite3-multiple-ciphers` (SQLCipher, 256-bit key)
- **Key**: generated once with `crypto.randomBytes(32)`, encrypted via `safeStorage`, stored in `userData/db.key`. Never plaintext on disk.
- **ORM**: Drizzle + Drizzle Kit for migrations
- **IDs**: UUIDv7 everywhere (time-sortable, sync-friendly)
- **Timestamps**: UTC ISO-8601 as TEXT
- **Soft deletes**: `deleted_at` column on notes and tasks

---

## Project structure

```
src/
  main/
    ipc/          ← one file per domain (notes.ts, tasks.ts, …)
    db/           ← schema, migrations, Drizzle queries
    services/     ← business logic
    security/     ← csp.ts, ipc-guard.ts, open-external-safe.ts
    index.ts      ← BrowserWindow factory + app lifecycle
  preload/
    index.ts      ← contextBridge surface (all of window.api lives here)
    index.d.ts    ← Window.api type declaration
  renderer/src/
    features/     ← notes/, tasks/, projects/, matrix/, search/, settings/
    components/   ← shared UI primitives
    hooks/
    state/        ← Zustand stores
  shared/         ← no framework imports; used by both main and renderer
    ipc/          ← channel name constants
    schemas/      ← Zod schemas
    types/        ← derived TypeScript types
```

---

## TypeScript

Strict mode is mandatory. All five extra safety flags are on (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`). Do not disable them or add `@ts-ignore` without a documented reason.

---

## Key tech decisions

| Choice | Reason |
|--------|--------|
| `sandbox: true` non-negotiable | Defense-in-depth; cheap to keep, expensive to retrofit |
| `better-sqlite3` (sync API) | Simplifies IPC handlers — no async callback complexity |
| Drizzle over Prisma | No separate Rust binary to package with Electron |
| TipTap (ProseMirror) | Mature markdown round-trip; rich extension ecosystem |
| UUIDv7 over auto-increment | Time-sortable, sync-friendly, no central allocator |
| Markdown as canonical storage | Portable, plain-text durable, sync-friendly |
| No cloud sync in v1 | Sync is where security architectures collapse; deferred deliberately |

---

## Phasing

- **Phase 0** (current): Hardened shell — security model in place, one IPC round-trip (`app:getVersion`), encrypted SQLite, ESLint rules
- **Phase 1**: Notes — TipTap, markdown CRUD, attachments, FTS5 search
- **Phase 2**: Todos core — task CRUD, projects, sections, quick-add NLP
- **Phase 3**: Todos advanced — recurring tasks, labels, filter DSL, command palette
- **Phase 4**: Eisenhower matrix view
- **Phase 5**: Polish — auto-update, export, accessibility audit

No feature work should begin until the Phase 0 security review is signed off (see ARCHITECTURE.md §3.10).
