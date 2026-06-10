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
| + | Consistent + Todo button — Tasks and Matrix headers now have the same triage capture button as Notes/Daily |
| + | ADR process — `docs/adr/` with template, index, and ADR-0001–0003 |
| + | CI/CD pipelines — GitHub Actions CI (PR/push) and Release (signed + notarised DMG on version tag) |
| + | App icon — `build/icon.icns` wired into `electron-builder.yml` |
| + | Security hardening — assertMainFrame reference identity, SHA-pinned actions, Dependabot, SECURITY.md |
| + | Daily Notes — fourth mode with calendar date tree, auto-create on first access, reuses NoteEditor |
| + | Custom DatePicker — portal-based calendar popover replacing native date inputs on all task due-date fields |
| + | Data protection hardening — VACUUM INTO backup, integrity check on startup, auto-backup on quit with rotation, encryption key export |
| + | HTML notes — imported .html files stored raw (bodyType 'html'), rendered in sandboxed iframe, editable as source |
| + | Obsidian vault import — scan-then-preview-then-import flow; detects daily notes by path, wiki-link/folder-prefix options |
| + | Folders — `folders` table (migration 0011), nested tree in Notes sidebar, per-note folder assignment, scope filtering |
| + | Daily note templates — `daily.template` setting; new daily notes pre-filled from Markdown template; "Edit template…" link in Daily sidebar |
| + | Spellcheck — macOS `NSSpellChecker` via `webPreferences.spellcheck: true`; context-menu with suggestions + "Add to Dictionary"; `editor.spellcheck` toggle in Settings → Editor |
| + | Vault import attachments — scanner counts `![[embeds]]`, importer copies matched files to `userData/attachments/<noteId>/` and converts to `attachment://` URLs; checkbox in preview modal |
| + | Vault re-sync — `checkExisting` scan flag, "exists" badges in preview, create-only / overwrite strategy; import result includes `notesUpdated` counter |
| + | HTML note FTS5 — raw HTML stripped from FTS index for HTML notes via `stripHtml()` called after create/update; clean search snippets |
| + | Inter-note wiki links — TipTap `WikiLink` mark, `[[Note Title]]` syntax, click-to-navigate/create via `notes:findByTitle` IPC |
| + | Vault service tests — `tryParseDailyDate`, `extractTitle`, `countWikiLinks`, `applyWikiLinks`, `buildTitle`, `safeVaultPath` |
| + | Editor toolbar active-state — `useEditorState` replaces inline `editor.isActive()` calls, eliminating unnecessary re-renders |
| + | Release workflow fix — sequential `--x64` then `--arm64` steps prevent parallel-publish 422 race on GitHub Releases |
| + | Preflight script — `scripts/preflight.sh` validates env, signing identity, and tests before tagging a release |
| + | Feedback & GitHub Issues — `app:openExternal` IPC channel, in-app "Feedback & Support" help section, GitHub issue templates (bug + feature request) |
| + | Vault root authorization — `vault:scan`/`vault:import` roots must be confirmed against a session allowlist (`security/vault-access.ts`); closes a renderer arbitrary-fs-read (ADR-0004) |

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
2. **Write an ADR** — if the session involved a significant architectural decision (new pattern, non-obvious trade-off, or a choice between competing approaches that was discussed and resolved through prompting), capture it as an ADR **before** committing:
   - Copy `docs/adr/template.md` to `docs/adr/NNNN-short-title.md` (next sequential number).
   - Fill in Context, Decision, Alternatives considered, and Consequences.
   - Add a row to the index table in `docs/adr/README.md`.
   - Include the ADR file(s) in the **same commit** as the feature code.
   - ADRs are write-once. If a decision is later reversed, mark the old record `Superseded by [NNNN](NNNN-...)` and write a new one.
3. **Update CLAUDE.md** — before staging, update:
   - "Current status" table with the new feature
   - Any new architectural sections, patterns, or gotchas discovered
   - This file goes in the **same commit** as the feature code, not a separate one.
4. **Update in-app help** — every user-visible feature must be documented in `src/renderer/src/features/help/helpContent.tsx`. Add a new `HelpSection` entry or extend an existing one. See the "In-app help" section below for the structure.
5. **Update README.md** — add the feature to the "What works today" section so the project page stays current.
6. **Commit** — one commit per logical feature. Stage files selectively so each commit is self-contained. Prefer small focused commits over one large "session" commit.

```sh
git add <feature files> docs/adr/NNNN-*.md docs/adr/README.md CLAUDE.md \
        src/renderer/src/features/help/helpContent.tsx README.md
git commit -m "feat: short description of what shipped"
```

**When does an ADR apply?** Roughly: if you would put the decision in a "Key tech decisions" table row, or if a future developer would reasonably ask "why was this done this way?", write the ADR. Routine implementation choices (component structure, variable naming) do not need one.

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

## In-app help

The full in-app documentation lives in a single file:
**`src/renderer/src/features/help/helpContent.tsx`**

It exports `HELP_SECTIONS: HelpSection[]` — an array of section objects. Each section has:

```ts
{
  id: string;       // unique, used as anchor/key
  title: string;    // shown in the section list and search results
  icon: string;     // emoji displayed next to the title
  keywords: string[]; // extra search terms beyond the title
  render: () => JSX.Element; // full section content
}
```

**Shared style helpers** (`H2`, `H3`, `P`, `Code`, `CodeBlock`, `Kbd`, `Callout`, `ShortcutTable`) are defined at the top of the file — use them for consistent typography. Do not write raw `<h2>`, `<p>`, etc.

**Adding a new section:**
1. Add a new object to `HELP_SECTIONS` in the appropriate position (sections appear in list order).
2. Add relevant `keywords` — the search filter matches against both `title` and `keywords`.
3. Run `npm run typecheck` — the `render` return type is checked.

**Rule:** Every user-visible feature must have a help section or be covered within an existing one. When shipping a feature, updating the help file is part of the definition of done (step 4 of the development workflow above).

---

## Daily Notes

Daily Notes is a fourth mode (alongside Notes, Tasks, Matrix) where every calendar day has exactly one note, auto-created on first access.

**Architecture — reuse the `notes` table, not a separate table:**

- A `daily_date TEXT` column (migration `0009_daily_notes.sql`) distinguishes daily notes from regular notes:
  - `daily_date IS NULL` → regular note (main Notes list, unaffected)
  - `daily_date = 'YYYY-MM-DD'` → daily note (Daily mode only)
- `notesService.list()` **always filters by `daily_date IS NULL` by default** — regular consumers never see daily notes. Pass `dailyOnly: true` in `NoteListInput` to fetch them.
- `notesService.getOrCreateDaily({ date })` is idempotent — calling it twice with the same date returns the same note ID. It creates a blank note only on the first call. Used for "Today →" and any sidebar date click.
- The year/month/day tree in `DailySidebar` is a **pure display concern** — there are no folder records in the DB. The tree is computed from `daily_date` strings in the renderer via `useDailyNotesList()`.
- `DailyMainPane` is a thin wrapper that renders `<NoteEditor noteId={...} />` — the editor is reused completely unchanged. Autosave, attachments, triage "+ Todo", and FTS5 search all work without modification.

**Key files:**
- `src/main/db/migrations/0009_daily_notes.sql` — column + partial index
- `src/main/services/notes.ts` — `getOrCreateDaily()`, updated `list()`, `formatDailyTitle()`
- `src/renderer/src/features/dailyNotes/DailySidebar.tsx` — tree UI + Today button
- `src/renderer/src/features/dailyNotes/DailyMainPane.tsx` — wrapper around NoteEditor
- `src/renderer/src/features/notes/queries.ts` — `useDailyNotesList()`, `useGetOrCreateDaily()`

**`selectedDailyDate` vs `selectedNoteId`:**
Both are tracked in Zustand. `selectedDailyDate` drives which date is highlighted in the sidebar tree. `selectedNoteId` is the note actually open in the editor — set to the result of `getOrCreateDaily` when a date is clicked. Switching away from Daily mode and back restores both (neither is cleared on mode switch).

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
      dailyNotes/ ← DailySidebar (year/month/day tree), DailyMainPane (wraps NoteEditor)
      tasks/      ← TasksSidebar, TaskList, TaskItem, TriageCard, quickAdd, queries
      quickCapture/ ← QuickCaptureApp (rendered instead of App when ?mode=capture)
      matrix/     ← MatrixView, MatrixSidebar, MatrixTaskDetail
      commandPalette/
      export/     ← ExportMenu, useExport
      settings/   ← SettingsModal, useSettings, ThemeWatcher
      update/     ← UpdateBanner, useUpdateStatus
      help/       ← HelpModal, helpContent
    components/   ← Toast, DatePicker (shared UI primitives)
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

**`assertMainFrame` uses reference identity, not URL equality**
- The guard in `src/main/security/ipc-guard.ts` checks `!event.senderFrame || event.senderFrame !== event.senderFrame.top`. Do not revert this to URL comparison — URL equality has two bypasses: a destroyed frame makes both sides `undefined` (which passes the `!==` check), and a subframe loaded from the same URL as the top frame also passes. Reference identity is unforgeable.

**electron-builder parallel arch publish race — 422 `already_exists`**
- Passing `--arm64 --x64` together causes electron-builder to publish both arches in parallel. Both find "release doesn't exist" at the same instant, both POST to create it, and the second gets `422 Unprocessable Entity: already_exists`.
- **Do not list arches in `electron-builder.yml`'s `mac.target`** — use plain target names (`dmg`, `zip`) and control arches exclusively via CLI flags (`--x64`, `--arm64`). If `electron-builder.yml` lists `arch: [arm64, x64]`, the `--x64` CLI flag does NOT restrict the build to x64; both arches are built in the same step and race to create the release.
- The workflow uses two sequential steps — `--x64` first (creates the draft release), then `--arm64` (uploads into the existing release). Do not collapse them or add arch arrays to the yml.

**GitHub Actions: pin to commit SHAs, not mutable tags**
- Both workflow files pin `actions/checkout`, `setup-node`, and `setup-python` to immutable commit SHAs with a `# vX.Y.Z` comment. The release workflow has access to signing certs and a `contents: write` token — mutable tags are the exact threat model where SHA pinning matters. Dependabot will keep the SHAs current via weekly PRs. Do not revert to `@v4`-style tags.
- CI workflow has `permissions: contents: read` at the workflow level. Release workflow has `permissions: contents: write` (required to create GitHub Releases). Do not widen permissions beyond what each workflow actually needs.

**Hardened runtime entitlements — non-negotiable for Electron**
- `com.apple.security.cs.allow-jit` **must be `true`** in `build/entitlements.mac.plist`. V8 needs to map executable memory for JIT compilation. Setting it to `false` causes an immediate startup crash: `Fatal process out of memory: Failed to reserve virtual memory for CodeRange`. This is not optional — every Electron app requires it.
- `com.apple.security.cs.disable-library-validation` **must also be `true`**. Native modules like `@journeyapps/sqlcipher` are not Apple-signed; with library validation enforced the dynamic linker refuses to load them under hardened runtime.

**`electron` must be in `devDependencies`, not `dependencies`**
- electron-builder enforces this and fails the build with a hard error if `electron` appears under `dependencies`. It is a build tool, not a runtime dependency of the packaged app. Always install with `npm install --save-dev electron@...`.

**electron-builder does not compile — run `npm run build` first**
- `npx electron-builder` only packages already-compiled output. It does not invoke electron-vite. If `out/main/index.js` does not exist when electron-builder runs, it fails with `Application entry file was not found in this archive`. The release workflow runs `npm run build` (electron-vite compile) as a separate step before `npx electron-builder`.

**Auto-update "Code signature did not pass" — ShipIt identity mismatch**
- ShipIt (the macOS ZIP update installer used by electron-updater) verifies that the update's signing identity matches the currently installed app. If the installed build was compiled locally (unsigned) or signed with a different Developer ID certificate than the update, ShipIt rejects it with "Code signature at URL ... did not pass."
- `publisherName` is Windows-only — there is no equivalent electron-builder config to override this for macOS. ShipIt reads the signing identity directly from the installed binary.
- **If a user hits this error**: they must manually download and install from the latest `.dmg` (one-time migration onto the signed-update path). Subsequent updater-delivered updates will work correctly once the installed app and the update share the same Developer ID.

**electron-updater requires a `.zip` target — DMG alone is not enough**
- The DMG is for first-time installation only. electron-updater downloads and applies a `.zip` for subsequent background updates. If `electron-builder.yml` only lists `dmg` as a target, the updater errors with `ZIP file not provided`. Both `dmg` and `zip` targets must be listed under `mac.target` for the full install + update flow to work.

**npm overrides — two entries exist for good reasons**
- `"tar": "^7.5.15"` — forces a safe tar version for a known CVE in a transitive dep.
- `"@esbuild-kit/core-utils": { "esbuild": "^0.25.0" }` — drizzle-kit@0.31.x still bundles the legacy `@esbuild-kit/esm-loader` which pins esbuild to ~0.18.20 (CVE GHSA-67mh-4wv8-2f99). drizzle-kit itself uses esbuild 0.25.x for its own operations; the @esbuild-kit path is legacy code that doesn't run a dev server, so the override carries no runtime risk. Remove once drizzle-kit drops @esbuild-kit.

**`vite` is pinned to v7 — do not upgrade to v8 without migrating plugin-react**
- `@vitejs/plugin-react@4` declares peer support for vite `^4–7` only. Upgrading vite to v8 breaks `npm ci` with an `ERESOLVE` peer conflict. The migration path to vite 8 requires `@vitejs/plugin-react@6`, which in turn requires `babel-plugin-react-compiler` as a peer dep — a deliberate migration, not a routine bump. Do not run `npm update` blindly.

**`src/shared/` is compiled under both Node and web tsconfigs — avoid DOM types in shared code**
- `tsconfig.node.json` has `"lib": ["ES2022"]` (no DOM), `tsconfig.web.json` has `"lib": ["ES2022", "DOM", "DOM.Iterable"]`. Since shared code is included in both, any DOM-specific type references cause `tsc -p tsconfig.node.json` compile errors.
- If you need to call `getAttribute` or other DOM methods in a shared TipTap extension, use a structural type alias like `type DomElement = { getAttribute?: (name: string) => string | null }` instead of `HTMLElement`. See `src/shared/markdown/extensions/WikiLink.ts` for the pattern.

**`notesService.list()` excludes daily notes by default**
- Since migration 0009, `list()` always appends `AND daily_date IS NULL` unless `dailyOnly: true` is passed. This means any code that calls `list({})` and expects to see all notes (e.g. export, FTS index rebuild) will silently skip daily notes. If a future feature needs all notes regardless of type, pass `includeAllTypes: true` — but first add that flag to the schema. Do not remove the default filter; it keeps the main Notes list clean.

**`folders` FK is enforced in the service layer, not the schema**
- The `notes.folder_id` column predates the `folders` table (added in 0000, table added in 0011). SQLite cannot add a FK constraint to an existing column, so referential integrity for `notes.folder_id → folders.id` lives in `foldersService`. Deleting a folder moves its notes to Unfiled (`folder_id = null`) and is blocked if sub-folders exist. Don't assume the DB enforces the FK.

**HTML notes store raw HTML in `body` with `bodyType = 'html'`**
- Imported `.html` files are NOT converted to Markdown (that changed in v1.1.8). `body` holds raw HTML, rendered via a fully sandboxed `<iframe srcDoc>` (`sandbox=""` — null origin, no scripts, no storage access) and edited as source. `NoteEditor` branches on `note.bodyType`. `attachment://` images still load because the Electron protocol handler runs in the main process and does not enforce frame origin.

**A renderer-supplied filesystem *root* must be authorized — `safeVaultPath()` alone is not enough**
- `safeVaultPath()` only stops a `relativePath` from escaping a root; it does NOT validate the root itself. `vault:scan` / `vault:import` take a `vaultPath` from the renderer, so that root must be confirmed against the session allowlist in `src/main/security/vault-access.ts` (`assertAuthorizedVault()`) before any disk read. The only thing that adds a path to the allowlist is `vault:pickFolder` calling `rememberAuthorizedVault()` with the native dialog's return value — a renderer-invented path like `/Users/x/.ssh` is never authorized. Without this, a compromised renderer gets arbitrary `fs` read (e.g. `vaultPath: '/'`, `relativePath: 'etc/passwd'`). The allowlist is in-memory and session-scoped (re-pick required after restart) and paths are `realpathSync`-canonicalised so `.`/`..`/symlinks can't bypass it. **Any new IPC channel that accepts a filesystem root from the renderer must gate that root the same way.** See [ADR-0004](docs/adr/0004-vault-root-authorization-allowlist.md).

**DB backup must use `VACUUM INTO`, not `copyFileSync`**
- In WAL mode SQLite has three files (`cinder.db`, `cinder.db-wal`, `cinder.db-shm`). Copying only the main file produces a backup that is either incomplete or corrupt if the WAL hasn't been fully checkpointed. `VACUUM INTO '/path/to/backup.db'` creates a consistent, fully-checkpointed snapshot in a single atomic operation, regardless of WAL state. The output is encrypted with the same SQLCipher key. This is what `exportBackup()` and `runAutoBackup()` both use.

**`will-quit` async pattern — use the `_quitting` guard**
- To run async work (the auto-backup) before the app exits, call `event.preventDefault()` and then `app.quit()` after the work finishes. Use a boolean guard (`_quitting`) to distinguish the first (preventable) call from the second (let it proceed) call. Without the guard you get an infinite quit loop. See the `will-quit` handler in `src/main/index.ts`.

**Auto-backup runs on every quit — keep it fast**
- `runAutoBackup()` is awaited synchronously in the quit path. `VACUUM INTO` on a typical notes database takes well under a second, but if it ever becomes slow (e.g. very large attachments stored as blobs), consider adding a size check or a timeout. The `finally` block in the `will-quit` handler ensures `app.quit()` is always called even if the backup throws.

**`new Date('YYYY-MM-DD')` is off-by-one in timezones west of UTC**
- `new Date('2026-05-27')` is parsed as UTC midnight, which is the *previous* day in `America/New_York` (UTC−5) when `.toLocaleDateString()` is called. To get the correct local date, always parse as noon-local: `new Date('2026-05-27T12:00:00')`. This is what `formatDailyTitle()` and `DailySidebar`'s `buildTree()` do. Apply the same pattern anywhere a YYYY-MM-DD string must be turned into a JS `Date` for display or weekday calculation.

**Capture window and `window-all-closed`**
- The capture popup is an always-hidden utility window. When the user closes the main window on macOS, `window-all-closed` fires but the app should keep running (tray icon stays). This works because macOS already skips `app.quit()` in the `window-all-closed` handler. The capture window is destroyed in `cleanupTray()` during `will-quit`. Do not add `captureWin` to any "visible windows" count that could trigger `app.quit()`.

---

## Security Review

- After applying security fixes, run the affected tests to confirm nothing breaks (especially path/symlink logic on macOS)
- Produce a SECURITY_FIXES.md documenting each issue and its concrete fix

---

## CI / CD and release process

**Workflows** (`.github/workflows/`):

| File | Trigger | What it does |
|------|---------|--------------|
| `ci.yml` | PR + push to `main` | typecheck → lint → test → unsigned build |
| `release.yml` | Push of `v*.*.*` tag | **CI gate** → `npm run build` → electron-builder (sign + notarise + publish) |

**Cutting a release — CI must be green first:**

```sh
# 1. Push your commit(s) to main and confirm CI goes green.
git push origin main
gh run watch   # streams the live CI run; Ctrl-C once it passes (or use GitHub UI)

# 2. Once CI is green, bump the version and push the tag.
npm version patch   # or minor / major — updates package.json, commits, tags
git push origin main --follow-tags
```

The release workflow has a **CI gate**: before doing any building it polls the GitHub Checks API and waits (up to 6 minutes) for the `validate` CI job to report `success` on the tagged commit's SHA. If CI failed, was cancelled, or never ran, the release workflow aborts immediately — no signed build is produced.

The gate handles the race condition in `--follow-tags`: the commit push and tag push happen simultaneously, so CI and the release workflow both start at the same moment. The release workflow simply waits for CI to finish.

Then go to GitHub → Releases, add release notes, and publish the draft.

**Required GitHub secrets** (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|--------|---------|
| `CSC_LINK` | Base64-encoded `.p12` Developer ID certificate |
| `CSC_KEY_PASSWORD` | Password for the `.p12` |
| `APPLE_ID` | Apple ID email for notarisation |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | 10-character team ID from developer.apple.com |

`GITHUB_TOKEN` is injected automatically — no secret needed.

**Verifying a signed build:**
```sh
spctl --assess --verbose=4 /Applications/Cinder.app        # should print "accepted, source=Notarized Developer ID"
codesign -dv --verbose=4 /Applications/Cinder.app          # confirm Authority= and Notarization Ticket=stapled
xcrun stapler validate /Applications/Cinder.app            # should print "The validate action worked!"
```

**Running the installed app with logs:**
```sh
/Applications/Cinder.app/Contents/MacOS/Cinder 2>&1 | tee ~/Desktop/cinder.log
```
Renderer logs go to DevTools (not stdout) — add `mainWindow.webContents.openDevTools()` in `src/main/index.ts` temporarily if needed.

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
