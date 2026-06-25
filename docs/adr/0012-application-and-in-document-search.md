# 0012. Application-wide search overlay and in-document find

Date: 2026-06-25  
Status: Accepted

---

## Context

Cinder had FTS5 search over notes, but it was only surfaced as a folder-scoped
filter box in the Notes sidebar. There was no way to:

1. Search **across everything** — notes of every type (regular, daily, drawing,
   HTML) *and* tasks — from one place and jump to a result regardless of the
   current mode.
2. Find text **inside the note you are editing** (the universal ⌘F "find on
   page" affordance), which every editor users reach for.

The ⌘K command palette navigates to *commands and scopes* (Inbox, a project, a
saved filter) via fuzzy-matching item labels; it does not search content. Tasks
had no search path at all.

## Decision

Ship two distinct search surfaces.

**1. Application search — a dedicated ⌘⇧F overlay** (`features/globalSearch/`),
separate from the ⌘K command palette.
- Notes reuse the existing `notes.search` FTS5 path, which already spans every
  note type (it filters only `deleted_at IS NULL`).
- Tasks get a new `tasks:search` IPC → `tasksService.search()` that does a
  case-insensitive `LIKE` substring scan over `title` + `description`, with the
  LIKE wildcards (`% _ \`) escaped via an `ESCAPE '\'` clause. It deliberately
  includes completed and triage tasks — a global "find anything" should surface
  them — but excludes soft-deleted rows. No FTS virtual table for tasks: they
  are short and few, so a scan is more than fast enough and avoids a second
  index + trigger to maintain.
- Selecting a result sets the correct mode and selection (daily note → Daily,
  drawing → Draw, regular/HTML note → Notes with folder scope reset, task →
  Tasks at its project/Inbox/Triage scope).

**2. In-document find — a ⌘F find bar** (`features/notes/FindInNote.tsx`) backed
by a custom TipTap extension (`searchHighlight.ts`) implemented as a ProseMirror
plugin that paints `Decoration.inline` highlights over matches and tracks a
"current" match for next/previous navigation. The bar reads match counts
reactively via `useEditorState`. No new dependency: `@tiptap/pm` already ships
the prosemirror primitives. The extension is decorations-only, so it has zero
impact on the markdown serde schema and is added to the editor-only extension
list (alongside the live-drawing image NodeView).

## Alternatives considered

| Option | Why not chosen |
|--------|---------------|
| Fold content search into the ⌘K command palette | Mixes two mental models (jump-to-command vs. find-content) and muddies the palette's fuzzy-label ranking. A separate overlay keeps each focused. |
| Add an FTS5 table for tasks | Tasks are short and low-cardinality; a `LIKE` scan is fast enough. An FTS table means another virtual table, sync triggers, and the raw-SQL column-list maintenance the notes index already demands — cost with no measurable benefit at this scale. |
| Use a third-party TipTap search-and-replace extension | Adds a dependency and its transitive surface to a security-sensitive app for ~150 lines of decoration logic we can own and test ourselves. |
| Reuse the browser's native ⌘F | Electron's in-page find is awkward to drive from a sandboxed renderer, doesn't integrate with ProseMirror positions, and can't be styled to match. |
| In-document find for HTML/drawing notes too | HTML notes render in a sandboxed iframe (no ProseMirror doc) and drawings are a canvas; both are out of scope for a decoration-based finder. Documented as Markdown-editor-only. |

## Consequences

**Positive**
- One keystroke (⌘⇧F) searches all content and navigates anywhere; one keystroke
  (⌘F) finds within the open note. Both are conventional and discoverable (top-bar
  button + help section).
- Tasks become searchable for the first time, through the normal service layer
  (no raw SQL outside the service) and validated Zod IPC boundary.
- The find extension is self-contained, dependency-free, and unit-tested
  (`searchHighlight.test.ts` covers the matcher, including the node-boundary
  limitation).

**Negative / watch points**
- The find matcher does not match terms split across formatting boundaries
  (bold/italic split text nodes). Acceptable and documented; matches the behaviour
  of most ProseMirror finders.
- `tasks.search` is a `LIKE` scan. Fine for a local single-user store; if tasks
  ever grew into the tens of thousands, revisit with FTS.
- Two ⌘F-family shortcuts now coexist: ⌘F (in-note) and ⌘⇧F (global). The global
  handler checks `e.shiftKey` first so they don't collide.

**Neutral**
- No migration: `tasks:search` is a new read-only channel; the find extension is
  renderer-only.
