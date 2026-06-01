# Cinder — Roadmap

Living backlog of planned improvements, ordered by priority within each tier.
Cross-reference the architecture in [`CLAUDE.md`](CLAUDE.md) before starting any item.

---

## ✅ Shipped

| Version | What shipped |
|---------|-------------|
| 1.0 | Hardened shell, Notes (WYSIWYG, FTS5, attachments, export), Tasks (CRUD, projects, recurrence, labels, filter DSL, command palette) |
| 1.1 | Eisenhower Matrix, triage workflow, menu-bar quick-capture, due-task notifications, Daily Notes, CI/CD, auto-update |
| 1.1.x | Calendar DatePicker, data protection hardening (VACUUM INTO backup, integrity check, auto-backup on quit, key export), CI gate on release, HTML note import/display, Obsidian vault import with preview |

---

## 🔴 High priority

### ~~H1 — Real folder support~~ ✅ shipped in v1.2.0
- Migration 0011: `folders` table with parent_id self-reference and order column
- Full CRUD service + IPC + preload surface (`window.api.folders.*`)
- Notes sidebar: collapsible folder tree with "All Notes" / "Unfiled" scope selectors, inline create/rename/delete
- NoteEditor header: folder assignment selector (hidden when no folders exist)
- Notes list + search: both filtered by selected folder scope
- Vault import folder→title prefix still in place; proper vault→folder mapping is a follow-on once vault re-sync (M1) lands

---

### ~~H2 — Daily note templates~~ ✅ shipped in v1.2.1
- Settings → Daily Notes: `daily.template` textarea (Markdown)
- `getOrCreateDaily()` reads `daily.template` from settings and populates `body` on create; existing notes unaffected
- "Edit template…" link in DailySidebar footer opens Settings modal

---

### H3 — Vault import: attachment support
**Why**: Obsidian vaults embed images and files via `![[image.png]]`. Without importing attachments, notes with images have broken references after import.

**Scope**:
- Scanner: include image/PDF files in `VaultScanResult.attachments` (already collected, just not imported)
- Importer: for each note being imported, find `![[filename]]` references, resolve them against the vault's attachment folder, copy to Cinder's `userData/attachments/<noteId>/` using `resolveAttachmentPath`
- Convert Obsidian embed syntax to `attachment://` URLs in the body
- Preview modal: enable the "Import attachments" checkbox (currently placeholder)

---

### ~~H4 — Fix Node.js 20 deprecation in CI workflows~~ ✅ shipped
- Bumped `actions/checkout` → v6.0.2, `actions/setup-node` → v6.4.0, `actions/setup-python` → v6.2.0 (SHA-pinned)

---

### ~~H5 — Resolve the moderate npm vulnerability~~ ✅ shipped
- CVE GHSA-67mh-4wv8-2f99: esbuild <=0.24.2 dev-server CSRF, surfacing via `drizzle-kit → @esbuild-kit/core-utils → esbuild@0.18.20`
- Fixed via `overrides["@esbuild-kit/core-utils"]["esbuild"] = "^0.25.0"` in package.json; no attack surface (drizzle-kit never runs an esbuild dev server); documented in CLAUDE.md gotchas

---

## 🟠 Medium priority

### M1 — Incremental vault re-sync
**Why**: Running the vault import twice duplicates every note. A re-sync mode that matches existing notes by title + daily_date (skip if exists, optionally update body if changed) lets users keep Cinder and their vault in sync as they add notes.

**Scope**:
- Scanner: add a `checkExisting` flag; service checks for title/date matches against the DB
- Preview modal: show "new / already exists / updated" status per item
- Import: skip or overwrite based on user choice

---

### M2 — HTML note FTS5 search improvement
**Why**: HTML notes store raw HTML in `body`, so searching returns snippets like `<p>meeting agenda</p>` instead of clean text. The FTS5 index should contain stripped text for HTML notes.

**Scope**:
- In `notes.ts` create/update: when `bodyType === 'html'`, strip HTML tags before writing to the FTS5 virtual table
- This requires updating the FTS5 trigger (if triggers are used) or the explicit FTS upsert in the service layer

---

### M3 — Inter-note links
**Why**: Obsidian's `[[wiki links]]` are currently stripped or left as literals. A proper internal link system would let users navigate between related notes and give imported vaults real structure.

**Scope**:
- Custom TipTap extension that recognises `[[Note Title]]` syntax and renders as a clickable link
- On click: look up the note by title, select it in the sidebar
- On create: if the target note doesn't exist, offer to create it
- Export: serialise back to `[[...]]` or standard Markdown links

---

### M4 — Tests for vault services
**Why**: `vaultScanner.ts` and `vaultImporter.ts` have zero unit tests. The date parsing logic (`tryParseDailyDate`) handles multiple format patterns and is exactly the code that benefits most from test coverage.

**Scope**:
- `vaultScanner.test.ts`: test `tryParseDailyDate` against every supported path pattern; test `extractTitle` with frontmatter, H1, and filename fallback; test `countWikiLinks`
- `vaultImporter.test.ts`: test `applyWikiLinks` conversion; test `buildTitle` prefix strategies
- Mock the filesystem (or use temp directories) for integration-style scanner tests

---

### M5 — Note list virtualisation
**Why**: `NoteList` renders all notes as DOM nodes. With hundreds of notes this is fine; with thousands (common after a large vault import) it causes layout and scroll lag.

**Scope**: Replace the note `<ul>` with TanStack Virtual's `useVirtualizer`. The list item height is fixed so this is a straightforward swap. Keep the existing search and drag-drop logic intact.

---

## 🟡 Lower priority / polish

### L1 — Export HTML notes as `.html` files
**Why**: `exportAllNotes` writes every note as `.md`. HTML notes exported as `.md` contain raw HTML markup which is meaningless without a browser. They should be saved as `.html` with the correct extension.

**Scope**: In `export.ts` `exportAllNotes`, check `note.bodyType === 'html'` and write `filename.html` instead of `filename.md`. Update the deduplication map to handle `.html` extensions.

---

### L2 — Dark mode inside HTML note preview
**Why**: The iframe renders the HTML file's own styles, which are almost always light-mode. When Cinder is in dark mode the white iframe creates a jarring flash.

**Scope**: In `HtmlBodyEditor`, inject a `<style>` block into `srcdoc` that applies `prefers-color-scheme: dark` defaults (background, text colour) as a baseline when the app is in dark mode. The injected styles should have low specificity so the document's own styles win.

---

### L3 — Keyboard shortcut: jump to today's daily note
**Why**: Switching to Daily mode and clicking "Today →" takes two interactions. A global shortcut (e.g. `⌘⇧D`) or a single keypress inside Daily mode (`T`) would make the daily journaling workflow faster.

**Scope**: Register a `T` key handler in `DailySidebar` (when not in an editable context) that calls `openDate(todayLocal())`. Optionally add a `⌘⇧D` global shortcut in `App.tsx` that both switches to Daily mode and opens today's note. Document in help content.

---

### L4 — Fix stale comment in NoteList.tsx
**Why**: The JSDoc still says `HTML files are converted to Markdown via turndown` — this is no longer true after the HTML notes feature landed in v1.1.8.

**Scope**: One-line comment fix. Update the JSDoc to say HTML files are stored as raw HTML with `bodyType: 'html'` and rendered in a sandboxed iframe.

---

### L5 — Recurring task edge case tests
**Why**: When a recurring task is completed, the RRULE advancement creates the next occurrence. Edge cases — tasks due on month-end dates, tasks that skip over the current date, tasks with `COUNT` or `UNTIL` limits — are not covered by tests.

**Scope**: Add targeted test cases to `recurrence.test.ts` covering: last day of month, year boundary, `COUNT=3` exhaustion, `UNTIL` in the past.

---

## Out of scope for v1 (deliberate deferrals)

| Topic | Reason deferred |
|-------|----------------|
| Cloud sync | Sync is where security architectures break. Deferred until the local-first model is fully proven. |
| Mobile / web | Electron-specific APIs (safeStorage, protocol handler, tray) are not portable. Requires architecture rethink. |
| Collaboration / sharing | Single-user, local-first is the security foundation. Multi-user changes the threat model entirely. |
| Plugin system | Plugins require relaxing the sandbox. Not compatible with the current security posture. |
| AI / LLM integration | Would require either a network connection or a bundled model — both out of scope for a local-first privacy tool. |

---

*Last updated: 2026-06-01. To start an item, create an ADR if the decision is non-obvious, update this file to mark it in-progress, and follow the development workflow in CLAUDE.md.*
