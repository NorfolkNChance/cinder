# CLAUDE.md — Cinder

Local-first macOS notes-and-todos app. Electron + React. **Security is foundational, not a feature.**

Full architectural spec: [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — read it before making structural decisions.

---

## Current status

**Feature-complete.** All phases are shipped plus post-phase additions:

| Phase | What shipped |
|-------|--------------|
| 0 | Hardened shell — sandbox, CSP, encrypted SQLite, ESLint security rules |
| 1 | Notes — TipTap WYSIWYG, markdown CRUD, attachments, FTS5 search, drag-and-drop import, export |
| 2 | Tasks — full CRUD, projects, sections, quick-add NLP |
| 3 | Tasks advanced — recurring tasks (RRULE), labels, filter DSL, command palette |
| 4 | Eisenhower matrix — 2×2 view, drag-and-drop, snapshot mode, task detail panel |
| 5 | Polish — auto-update, backup/export, settings modal, accessibility audit |
| + | Editor formatting ribbon (TipTap toolbar) |
| + | Auto/Light/Dark theme with system-preference tracking |
| + | Triage workflow — capture todos from notes, acknowledge before entering normal flow |
| + | External security audit findings resolved |
| + | Menu-bar quick-capture — tray icon + ⌘⇧Space global shortcut, frameless popup |
| + | Due-task notifications — macOS alerts for tasks due today/overdue, 15-min checks |
| + | Note → Task source link — triage tasks link back to the note they came from |

---

## Commands

```sh
npm run dev          # start electron-vite dev server + Electron
npm run build        # production build
npm run typecheck    # tsc strict check (main + renderer)
npm run lint         # eslint flat config
npm run test         # vitest unit tests
npm run release      # production build + publish to GitHub Releases (needs GH_TOKEN)
```

## Development workflow

After every feature session:

1. **Verify** — `npm run typecheck && npm run lint` must both pass clean before committing.
2. **Update CLAUDE.md** — before staging, update:
   - "Current status" table with the new feature
   - Any new architectural sections, patterns, or gotchas discovered
   - This file goes in the **same commit** as the feature code, not a separate one.
3. **Commit** — one commit per logical feature. Stage files selectively so each commit is self-contained. Prefer small focused commits over one large "session" commit.

```sh
git add <feature files> CLAUDE.md
git commit -m "feat: short description of what shipped"
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

8. **Navigation guards** — `will-navigate` and `will-redirect` use the `URL` API to compare origins, not `String.startsWith()`. The `startsWith` approach is bypassable via basic-auth syntax (`http://localhost:5173@evil.com` passes a prefix check but navigates to `evil.com`). See `isAllowedNavigation()` in `src/main/index.ts`.

---

## Adding a new setting

No migration required — the settings service fills missing DB rows from `DEFAULT_SETTINGS` at read time. Just:

```ts
// 1. src/shared/schemas/settings.ts — add the Zod validator, add to schema + defaults
const MyFlag = z.boolean();

export const AppSettingsSchema = z.object({
  // ... existing keys ...
  'feature.myFlag': MyFlag,
});

export const DEFAULT_SETTINGS: AppSettings = {
  // ... existing defaults ...
  'feature.myFlag': true,
};

// 2. src/renderer/src/features/settings/SettingsModal.tsx — add a Section + SidebarItem
// 3. Done. The IPC layer (settings:getAll / settings:set) requires no changes.
```

**Do not** add a SQL migration for new settings keys — the `settings` table is a generic key/value store and the service handles missing rows automatically.

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

For **push events** (main → renderer, e.g. update status), the pattern is different — use `webContents.send()` on the main side and expose a subscription function via contextBridge:

```ts
// preload
onStatus: (cb: (status: UpdateStatus) => void): (() => void) => {
  const handler = (_e: IpcRendererEvent, status: UpdateStatus): void => cb(status);
  ipcRenderer.on(UPDATE_STATUS, handler);
  return () => ipcRenderer.off(UPDATE_STATUS, handler);
},
```

---

## Database

- **Engine**: `@journeyapps/sqlcipher` (SQLCipher, AES-256). The driver is **async / callback-based** — there is no sync `.all()` API. All Drizzle queries must use `await`.
- **Key**: generated once with `crypto.randomBytes(32)`, encrypted via `safeStorage` (macOS Keychain), stored as an encrypted blob in `userData/db.key`. Never plaintext on disk. `safeStorage.decryptString()` can throw if the Keychain is inaccessible — it is wrapped in a try-catch with `dialog.showErrorBox` + `app.exit(1)`.
- **ORM**: Drizzle via the `sqlite-proxy` adapter (required for async drivers). Do not call `.all()` — it does not exist on this adapter. Use `await db.select().from(...)`.
- **Migrations**: SQL files in `src/main/db/migrations/`. The runner glob-matches `*.sql` in order — **no registration step required**. Name new files `NNNN_description.sql` and they are picked up automatically.
- **IDs**: UUIDv7 everywhere (time-sortable, sync-friendly)
- **Timestamps**: UTC ISO-8601 as TEXT
- **Soft deletes**: `deleted_at` column on notes and tasks
- **Booleans**: SQLite has no native boolean. Use `INTEGER NOT NULL DEFAULT 0` (0/1) and `z.number().int().min(0).max(1)` in Zod schemas. Check as `value === 1` in the UI.

---

## Theme system

Tailwind is configured with `darkMode: 'class'`. The `.dark` class on `<html>` gates all `dark:` variants.

- **Light mode** = default classes (no prefix)
- **Dark mode** = `dark:` prefixed classes, applied when `.dark` is on `<html>`

The `ThemeWatcher` component (`src/renderer/src/features/settings/ThemeWatcher.tsx`) reads `appearance.theme` from settings and manages the `.dark` class — including a `MediaQueryList` listener for `'auto'` mode. Do not toggle `.dark` anywhere else.

When adding new UI components, **always provide both light and dark variants**:
```
bg-white dark:bg-gray-950        ← surfaces
bg-gray-100 dark:bg-gray-900     ← panels / inputs
border-gray-200 dark:border-gray-800
text-gray-900 dark:text-white    ← primary text
text-gray-500 dark:text-gray-500 ← muted (same both modes)
```

ProseMirror editor light-mode overrides live in `src/renderer/src/index.css` under `:root:not(.dark) .ProseMirror`.

---

## State management

Two distinct layers — do not confuse them:

| Layer | Tool | What goes here |
|-------|------|----------------|
| UI state | Zustand (`useUI` in `src/renderer/src/state/ui.ts`) | Ephemeral local state: active mode, selected note/task, modals open, toast, matrix prefs |
| Server / IPC state | TanStack Query | Anything fetched from main via IPC: notes list, tasks list, settings, projects, labels |

TanStack Query keys live in `src/renderer/src/lib/query-client.ts`. Mutations always invalidate the relevant `*.all` key prefix to refresh all affected lists.

---

## Triage workflow

Tasks stamped `triage = 1` are hidden from all normal views (Inbox, Today, matrix, filter DSL, etc.) until acknowledged. Two entry points produce triage tasks:

- **"+ Todo"** button in the NoteEditor header — also stores `sourceNoteId` so TriageCard can link back to the originating note.
- **⌘⇧Space quick-capture** popup — no source note context; `sourceNoteId` is null.

Key pieces:

- **Triage view** in the Tasks sidebar shows only `triage = 1` tasks with an amber badge count.
- **TriageCard** (`src/renderer/src/features/tasks/TriageCard.tsx`) renders each task with inline priority, due-date, project controls, and an `↗ [Note title]` backlink when `sourceNoteId` is set.
- **Acknowledge** saves all setup fields and sets `triage = 0` in one mutation — the task then appears in Inbox or its assigned project.
- The `tasksService.list()` always adds `AND triage = 0` by default; pass `triageOnly: true` in `TaskListInput` to fetch triage tasks.

---

## Due-task notifications

Handled entirely in the main process by `src/main/services/notifier.ts`.

- **`initNotifier(mainWindowGetter)`** — takes a getter (not the window directly) so notification clicks always resolve the *current* main window even if it was closed and recreated.
- **Check schedule**: 15 s after startup, then every 15 minutes. Resets at local midnight and fires an immediate check.
- **Query**: `tasksService.list({ dueBefore: tomorrowLocal() })` — all active, non-triage tasks with a due date on or before today.
- **Dedup**: a `Set<string>` of notified task IDs, cleared at midnight. Overdue tasks surface once per calendar day.
- **Two notifications when needed**: one for tasks due today, one for tasks already overdue — keeps the language precise.
- **Click handler**: `mainWindow.show()` + `webContents.send(NOTIFY_TASK_DUE)` → renderer navigates to Tasks › Today.
- **Setting**: `notifications.enabled` (boolean, default `true`) — toggled in Settings › Notifications. No migration needed; the settings service fills missing keys from `DEFAULT_SETTINGS`.
- **`Notification.isSupported()`** is checked before starting — gracefully does nothing on platforms without OS notifications.

---

## Menu-bar quick-capture

A frameless popup accessible via the macOS menu-bar tray icon or the global shortcut **⌘⇧Space** (works even when Cinder is in the background).

- **`src/main/tray.ts`** — creates the Tray icon (22×22 RGBA PNG built at runtime via `deflateSync` + CRC32 — no bundled asset), registers the global shortcut, and manages the capture `BrowserWindow` lifecycle (pre-warmed on startup, hidden on blur).
- **`src/main/ipc/capture.ts`** — `capture:hide` IPC channel. The sandboxed renderer cannot close its own window, so it delegates to main. `setCaptureWindow(win)` is called by `tray.ts` once the window is created.
- **`src/renderer/src/features/quickCapture/QuickCaptureApp.tsx`** — the UI. Detects `?mode=capture` in the URL (set by tray.ts when loading the window) and renders a lightweight input instead of the full three-pane app. Uses the same NLP parser and produces a Triage task (`triage: 1`).
- The capture window uses **identical** `webPreferences` to the main window (`sandbox:true`, `contextIsolation:true`, same preload). Security is not relaxed for utility windows.
- Theme: follows system preference directly (no settings IPC round-trip) to avoid a flash on first open.

**Tray PNG generation** (in `tray.ts`):
- Manual CRC32 table + `deflateSync` — no external image dep.
- `nativeImage.setTemplateImage(true)` — macOS auto-tints for dark/light menu bar.

---

## Project structure

```
src/
  main/
    ipc/          ← one file per domain (notes, tasks, export, settings, update, capture, …)
    db/
      migrations/ ← numbered SQL files, auto-run in order (no registration needed)
      schema.ts   ← Drizzle table definitions
      drizzle.ts  ← Drizzle instance (sqlite-proxy adapter)
      migrate.ts  ← migration runner
    services/     ← business logic (notes, tasks, export, settings, updater, notifier, …)
    security/     ← csp.ts, ipc-guard.ts, open-external-safe.ts
    protocol/     ← attachment:// custom protocol handler
    index.ts      ← BrowserWindow factory, navigation guards, app lifecycle
  preload/
    index.ts      ← contextBridge surface (all of window.api lives here)
    index.d.ts    ← Window.api type declaration
  renderer/src/
    features/
      notes/      ← NoteList, NoteEditor, TipTapEditor, EditorToolbar, AddTriageTodo, fileImport
      tasks/      ← TasksSidebar, TaskList, TaskItem, TriageCard, quickAdd, queries
      quickCapture/ ← QuickCaptureApp (rendered instead of App when ?mode=capture)
      matrix/     ← MatrixView, MatrixSidebar, MatrixTaskDetail
      commandPalette/
      export/     ← ExportMenu, useExport
      settings/   ← SettingsModal, useSettings, ThemeWatcher
      update/     ← UpdateBanner, useUpdateStatus
      help/       ← HelpModal, helpContent
    components/   ← Toast (shared UI primitives)
    hooks/        ← useFocusTrap, useDebouncedCallback, useDebouncedValue
    lib/          ← query-client, dates
    state/        ← ui.ts (Zustand store)
  shared/         ← no framework imports; used by both main and renderer
    ipc/          ← channel name constants
    schemas/      ← Zod schemas (tasks, notes, settings, export, update, …)
    types/        ← derived TypeScript types
    markdown/     ← TipTap extensions, serialize/deserialize
    filter/       ← DSL lexer, parser, SQL compiler
    matrix/       ← Eisenhower classification logic
    recurrence/   ← RRULE advancement helpers
```

---

## TypeScript

Strict mode is mandatory. All five extra safety flags are on (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`). Do not disable them or add `@ts-ignore` without a documented reason.

With `exactOptionalPropertyTypes`, you cannot pass `key: undefined` where a key is simply absent. Use conditional spreads:
```ts
// ✓
const input = {
  title,
  ...(projectId !== null ? { projectId } : {}),
};

// ✗ — fails exactOptionalPropertyTypes
const input = { title, projectId: projectId ?? undefined };
```

---

## Known gotchas

These have burned us before. Check here before debugging similar symptoms.

**Bundler config filename**
- electron-vite looks for `electron.vite.config.ts` (dot, not dash). A file named `electron-vite.config.ts` is silently ignored and defaults are used — leading to massive bundles (~20 MB) with native modules incorrectly inlined. If the main-process bundle size looks wrong, check the filename first.

**Drizzle / async driver**
- `@journeyapps/sqlcipher` is callback-based. Drizzle wraps it via `sqlite-proxy` making all queries async. Do **not** call `.all()` — it does not exist. Every query is `await db.select().from(table)...`.
- The `listByFilter` function in `tasks.ts` drops to raw SQL via `db.all()` on the underlying `node-sqlite3` driver — that is the one place raw `.all()` is valid and intentional. **When you add a new column to the `tasks` table, you must also add it to the explicit column list in `listByFilter`'s raw SQL string.** Drizzle's type inference won't catch the omission — the column will silently be absent from filter-DSL query results (the bug only surfaces when using a saved filter, not in normal list views).

**Drag-and-drop in sandboxed Electron**
- `DataTransferItem.getAsFile()` returns `null` during `dragenter` and `dragover` — file names and contents are only accessible in the `drop` handler. During `dragenter`, check `item.kind === 'file'` optimistically. Run the real extension check only in `handleDrop` via `importDroppedFiles`.

**URL navigation guards**
- Never use `url.startsWith(appUrl)` for navigation checks. `http://localhost:5173@evil.com` passes a prefix check but navigates to `evil.com` (basic-auth syntax). Always parse with `new URL()` and compare `.origin` (dev) or `.href` (prod `file://`). See `isAllowedNavigation()` in `src/main/index.ts`.

**ASCII quotes in TSX**
- Always use straight ASCII quotes (`"`, `'`) in JSX attribute values and string literals. "Curly" / "smart" quotes (`"`, `"`, `'`, `'`) are invalid JavaScript and cause ESLint parse errors. Some editors or clipboard pastes can silently introduce them.

**`triage` column is 0/1 integer, not boolean**
- SQLite stores booleans as integers. The `triage` column is `INTEGER NOT NULL DEFAULT 0`. In Zod it is `z.number().int().min(0).max(1)`. In the UI, check `task.triage === 1`. In `TaskListInput`, the filter field is `triageOnly: z.boolean()` (the boolean/integer distinction is at the service boundary).

**Focus traps and modals**
- Every modal uses `useFocusTrap(ref, isOpen)` from `src/renderer/src/hooks/useFocusTrap.ts`. This hooks saves the previously-focused element and restores focus when the modal closes. Do not call `element.focus()` manually inside modals — the trap handles initial focus.

**`safeStorage` errors**
- `safeStorage.decryptString()` throws if the macOS Keychain is inaccessible. The error is caught in `getOrCreateDbKey()` in `src/main/db/index.ts` and shown via `dialog.showErrorBox` before `app.exit(1)`. If you see the app crash silently at startup on a fresh machine, check this path first.

**`file://` URL origins**
- `new URL('file:///path/to/file.html').origin` returns the *string* `"null"` (not the value `null`). Do not compare origins for `file://` URLs — compare the full `.href` instead.

**Capture window and `window-all-closed`**
- The capture popup is an always-hidden utility window. When the user closes the main window on macOS, `window-all-closed` fires but the app should keep running (tray icon stays). This works because macOS already skips `app.quit()` in the `window-all-closed` handler. The capture window is destroyed in `cleanupTray()` during `will-quit`. Do not add `captureWin` to any "visible windows" count that could trigger `app.quit()`.

---

## Key tech decisions

| Choice | Reason |
|--------|--------|
| `sandbox: true` non-negotiable | Defense-in-depth; cheap to keep, expensive to retrofit |
| `@journeyapps/sqlcipher` (async) | SQLCipher AES-256 encryption; async driver via Drizzle sqlite-proxy |
| Drizzle over Prisma | No separate Rust binary to package with Electron |
| TipTap (ProseMirror) | Mature markdown round-trip; rich extension ecosystem |
| UUIDv7 over auto-increment | Time-sortable, sync-friendly, no central allocator |
| Markdown as canonical storage | Portable, plain-text durable, sync-friendly |
| Zustand for UI state | Lightweight, no boilerplate, easy selector subscriptions |
| TanStack Query for IPC state | Cache invalidation, loading states, background refetch |
| `darkMode: 'class'` (Tailwind) | Allows programmatic control (Auto/Light/Dark setting) |
| Triage queue for note-captured todos | Prevents half-formed tasks polluting Inbox/Today/Matrix |
| No cloud sync in v1 | Sync is where security architectures collapse; deferred deliberately |
