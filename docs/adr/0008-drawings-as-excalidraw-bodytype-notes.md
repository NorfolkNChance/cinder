# 0008. Store drawings as notes with `bodyType: 'excalidraw'`

Date: 2026-06-23  
Status: Accepted

---

## Context

Draw mode (ADR-0007) needs persistence. A drawing is an Excalidraw scene (`{ elements, appState, files }`) plus a title. The notes table already supports multiple body representations via `bodyType` (`markdown`, `html`) and the editor branches on it. Daily notes set the precedent for a distinct note "kind" living in the same table, distinguished by a column and excluded from the default list.

We considered a separate `drawings` table + a full new IPC domain, but that would duplicate the list/search/folder/project/soft-delete/backup machinery the notes domain already provides.

## Decision

A drawing is a note with **`bodyType: 'excalidraw'`** and the serialized scene JSON in `body`. No new table, no migration (the `body_type` column from 0010 already exists).

- **Listing** — `notesService.list()` excludes drawings by default (like daily notes) and supports `drawingsOnly: true` for Draw mode. Regular notes filter `body_type != 'excalidraw'` AND `daily_date IS NULL`.
- **FTS** — the scene JSON must never hit the FTS index raw. On create/update, `extractDrawingText()` parses the scene and indexes only the user-authored text elements (mirrors `stripHtml()` for HTML notes).
- **Body cap** — raised to `MAX_BODY_CHARS` (8 MB) in the notes schema; a scene with embedded raster images can exceed the old 1 MB prose bound. `serializeAsJSON` is the canonical serializer and prunes unreferenced files.
- **Editor** — `ExcalidrawEditor` loads `body` → `initialData`, autosaves (debounced) on real scene changes only (keyed off `getSceneVersion` + file count + background, so pan/zoom/selection don't churn writes). It reuses the generic `useNote`/`useUpdateNote`/`useDeleteNote` hooks; drawing-specific hooks (`useDrawingsList`, `useCreateDrawing`) just pin the filter.
- **Mode** — Draw is a fifth mode with its own Zustand selection (`selectedDrawingId`), parallel to Notes/Daily, mirroring the daily-notes split.

## Alternatives considered

| Option | Why not chosen |
|--------|---------------|
| Separate `drawings` table + IPC domain | Duplicates list/search/folder/project/soft-delete/backup for no benefit; drawings ARE notes. |
| Store scene as an attachment file, body holds a pointer | More moving parts; loses FTS-able text and the simple update path; no real size win for vector scenes. |
| Keep the 1 MB body cap | Embedded raster images in a scene blow it, causing silent save failures. |

## Consequences

**Positive**
- Inherits folders, projects, soft-delete, VACUUM backup, and the links machinery for free.
- Minimal surface: an enum widening, a list filter, an FTS branch, and renderer UI — no schema migration.
- Embeds into notes can reuse the existing attachment + paste-image pipeline (PNG raster, no harfbuzz).

**Negative / watch points**
- The 8 MB body cap is a real DoS ceiling but larger than prose needs; revisit if scenes with many raster images become common (offload binaries to attachments then).
- **Any code calling `notesService.list({})` and expecting all notes now also skips drawings** (in addition to daily). Pass `drawingsOnly`/`dailyOnly` explicitly. Documented in CLAUDE.md.
- Embedded raster `files` currently persist inline in `body`. Binary offload to `attachment://` is deferred future work.

**Neutral**
- A drawing with no scene yet has `body = ''`, which `parseScene` treats as an empty canvas.
