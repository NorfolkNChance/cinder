# 0009. Live drawing embeds via a `drawing://` image NodeView

Date: 2026-06-23  
Status: Accepted

---

## Context

Phase 2 (ADR-0008) embedded a drawing into a note as a static PNG attachment — portable, but frozen at insert time. The goal now is a *live* embed: a note shows the referenced drawing's current state and reflects edits, with a way to jump to editing it ("Excalidraw-in-Obsidian").

Constraints:
- The markdown serde (`src/shared/markdown`) is shared by main and renderer; it must stay free of React/renderer code. A live, reactive embed is inherently renderer-only.
- Markdown is the canonical storage, so whatever represents the embed must round-trip through the serializer/deserializer.
- Modes don't co-render — editing a drawing in Draw mode unmounts the note's editor — so "live" means "reflects the latest state when viewed", not real-time simultaneous update. Queries use `staleTime: Infinity`; the cache updates only via the app's own `invalidateQueries`.

## Decision

A live embed is an ordinary **`image` node whose `src` is `drawing://<drawingId>`** — a logical reference, never fetched over a protocol.

- **No serde changes.** markdown-it's `validateLink` only blocks `javascript:/vbscript:/file:/data:`, so `drawing://` round-trips as `![title](drawing://id)` exactly like `attachment://`. No new node type, no custom token, no serializer edits.
- **Rendering is a renderer-only React NodeView** (`features/draw/DrawingEmbed.tsx`). The editor swaps the shared base `Image` node for `ConfiguredImage.extend({ addNodeView })`; the node *spec* is unchanged, so the serde schema is unaffected. The NodeView branches on `src`: non-`drawing://` images render a plain `<img>` (unchanged behavior); `drawing://` images fetch the drawing reactively (`useNote`) and rasterize its scene to PNG via `exportToBlob` (eval-free, like the snapshot path). Editing the drawing invalidates the notes cache → the embed refetches → re-rasterizes. Double-click opens the drawing in Draw mode.
- **Snapshot embeds are retained** as an explicit alternative. The "✏️ Drawing" toolbar dropdown has a Live/Snapshot toggle (default Live). Snapshot inserts the Phase 2 static `attachment://` PNG — portable and export-safe; Live inserts the `drawing://` reference.

## Alternatives considered

| Option | Why not chosen |
|--------|---------------|
| A dedicated `drawingEmbed` node type | Requires custom markdown token + serializer/deserializer changes in shared code; the image-with-scheme reuse needs none. |
| Store a real PNG attachment + a `drawingId` sentinel, regenerate on change | Best portability + live, but needs attachment lifecycle management (re-export, overwrite, GC stale files) — too much for this phase. Snapshot mode covers the portability need. |
| Mount a full Excalidraw inside the NodeView | Multiple heavy editor instances per note; complex and slow. |

## Consequences

**Positive**
- Live embeds with zero serde/schema/protocol changes; reuses the existing markdown image round-trip.
- The shared markdown module stays renderer-free (the NodeView lives in the renderer; only the node *spec* is shared).
- Users choose per-insert: Live (in-app, auto-updating) or Snapshot (portable PNG).

**Negative / watch points**
- **`drawing://` is not portable.** A note exported to `.md` carries a `drawing://id` reference that resolves only inside Cinder. Users who need a portable image use Snapshot mode (or copy-paste). Document this.
- "Live" is **reflect-on-view**, not real-time: the embed updates when the note is (re)opened or the drawing's query is invalidated, because modes don't co-render and `staleTime` is `Infinity`.
- The editor now wraps every image in a React NodeView. Plain images are rendered as a simple `<img>` inside it — equivalent to before, but a behavior surface to keep in mind.
- A deleted drawing leaves a "Drawing not found" placeholder; an empty drawing shows an inline notice (export throws on no elements).
