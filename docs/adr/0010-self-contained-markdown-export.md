# 0010. Self-contained markdown export via data-URI inlining

Date: 2026-06-23  
Status: Accepted

---

## Context

Exporting a note to `.md` wrote the stored body verbatim. That body references
images with app-only schemes — `attachment://<noteId>/<file>` (pasted images,
drawing snapshots) and `drawing://<id>` (live drawing embeds, ADR-0009). Outside
Cinder those are dead links, so an exported note with any image was not portable
— the gap ADR-0009 explicitly called out for live embeds, but it applied to
ordinary attachments too.

Rendering a `drawing://` embed requires rasterizing an Excalidraw scene, which
only the **renderer** can do (canvas). Reading an `attachment://` file requires
**main** (filesystem; the renderer can't even `fetch()` the bytes — cross-origin
canvas tainting blocks it). So no single process can resolve both.

## Decision

On export, inline every referenced image as a base64 `data:` URI, producing a
self-contained `.md` that renders anywhere (GitHub, VS Code, Obsidian) and
re-imports cleanly (markdown-it allows `data:` for images; the Image node has
`allowBase64`).

Resolution is split along the capability line, glued by a shared, DOM-free
rewriter `mapImageSrcs(markdown, replace)` (`src/shared/markdown/imageSrcs.ts`)
that maps the destination of each markdown image:

- **`attachment://` → data URI in the main export service.** Reads the file
  (path validated exactly as the protocol handler does), base64-encodes it.
  Applied to **both** single-note and all-notes export — every static image
  becomes portable.
- **`drawing://` → data URI in the renderer**, before `export:note` is called
  (`inlineDrawingEmbeds` → `exportToBlob` → `FileReader` data URL). The resolved
  body is passed as the new optional `ExportNoteInput.body`; main uses it as the
  base, then inlines attachments on top. **Scoped to single-note export** — bulk
  export has no per-note renderer pass.

`mapImageSrcs` is imported from its **leaf module**, never the `shared/markdown`
barrel, because the barrel pulls `schema.ts` (TipTap/`getSchema`) which must
never load in the main process (no DOM in Node).

## Alternatives considered

| Option | Why not chosen |
|--------|---------------|
| Export to a folder (`.md` + sibling image files) | More portable for huge images, but changes the single-file Save-dialog UX and adds path/asset-folder management. Data URIs keep the existing one-file flow. |
| Snapshot live embeds to attachments at insert time | Couples editing to export; lifecycle of the generated PNGs (dedup, GC) is messy. ADR-0009 deliberately kept live embeds reference-only. |
| Leave refs as-is | Not portable — the problem. |

## Consequences

**Positive**
- Single-note export ("Export this note…") is fully portable; all-notes export is portable for every static image.
- Re-importing an exported `.md` works — `data:` images round-trip back in.
- The split keeps each process doing only what it can; `mapImageSrcs` is pure and unit-tested.

**Negative / watch points**
- Base64 inlining inflates the `.md` (~33% over raw image bytes). Fine for sketches; a very image-heavy note produces a large file. `ExportNoteInput.body` is capped at 64 MB.
- **All-notes export does not resolve `drawing://` live embeds** (no renderer pass) — they remain references in bulk export. Use single-note export, or Snapshot mode, for portable drawings in bulk. Documented in the export service.
- An unreadable/missing attachment or un-rasterizable drawing is left as its original reference (best effort) rather than failing the export.
