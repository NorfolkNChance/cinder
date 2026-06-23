# 0007. Embed Excalidraw via a self-hosted asset scheme under strict CSP

Date: 2026-06-23  
Status: Accepted

---

## Context

We want Excalidraw-style sketch diagrams as a first-class feature (Draw mode). `@excalidraw/excalidraw` is an MIT React component that bundles into the renderer — no hosted service, account, or subscription. But Cinder's security posture (sandboxed renderer, strict CSP, local-first/offline) collides with how Excalidraw loads assets at runtime, and a Phase 0 spike surfaced three concrete issues that had to be resolved before adopting it:

1. **CDN by default.** Excalidraw lazily fetches its fonts, locale JSON, and font-subsetting worker from `window.EXCALIDRAW_ASSET_PATH`, which defaults to the `esm.sh` CDN. A local-first app must never reach the network for these.
2. **`file://` can't satisfy `font-src 'self'`.** In production the renderer loads from `file://`, whose opaque origin does not match CSP `'self'`. Self-hosted fonts served over `file://` get blocked, and Excalidraw silently falls back to its CDN (also blocked). This is the same wall that motivated the existing `attachment://` scheme.
3. **`new Function` / WebAssembly exist in the package.** The spike found `new Function` and `WebAssembly.instantiate` in the bundle — which would require `'unsafe-eval'`, directly violating non-negotiable security rule #4. Static and runtime analysis showed these live **only** in `subset-worker.chunk.js` (harfbuzz font-subsetting), a lazily-spawned module Worker used for SVG font-embedding on export — never on the drawing-canvas path. Runtime confirmed zero eval/wasm violations when drawing.

## Decision

Embed Excalidraw as a bundled dependency and serve its assets entirely locally:

- **Custom privileged scheme `excalidraw-asset://`** (`src/main/protocol/excalidraw-asset.ts`), registered `standard: true` + `secure: true` (a real, CSP-comparable origin — exactly why `attachment://` exists). It serves the assets that `scripts/copy-excalidraw-assets.mjs` copies from the package's `dist/prod` into the renderer bundle. The handler resolves paths under the assets root (rejecting traversal) and **adds `Access-Control-Allow-Origin: *`** — cross-origin `@font-face` (unlike a manual `fetch()`) requires CORS headers or the font is rejected and the CDN fallback fires.
- **Asset path set by a classic script** (`src/renderer/public/set-excalidraw-asset-path.js`), loaded before the module bundle. It points `EXCALIDRAW_ASSET_PATH` at `excalidraw-asset://assets/` under `file://` and at a document-relative URL under the dev server. It must be a classic script, not a module statement, because Rollup may reorder a side-effect-only module relative to Excalidraw's (no dependency edge), setting the global too late.
- **CSP gains `excalidraw-asset:`** in `script-src`, `worker-src`, `font-src`, `connect-src`, plus `worker-src 'self' blob:`. **`script-src` keeps no `'unsafe-eval'`** — the canvas needs none. The only eval/wasm path (harfbuzz) is confined to the subset Worker and the avoided SVG-font-embed export; rule #4 stays intact for the main realm.

## Alternatives considered

| Option | Why not chosen |
|--------|---------------|
| Let Excalidraw use its esm.sh CDN | Breaks offline/local-first and strict CSP; ships a network dependency. |
| Serve assets over `file://` and add `file:` to `font-src` | `file://`'s opaque origin doesn't reliably satisfy CSP; `file:` is a broad, blunt grant. The `attachment://` precedent already shows the right answer is a standard scheme. |
| Add `'unsafe-eval'` to `script-src` to allow harfbuzz | Violates non-negotiable rule #4 for the whole renderer to enable an export path we don't even use. The eval code is isolated to a Worker and avoidable. |
| Build Excalidraw from source without fonts/worker | Heavy maintenance burden; we don't control its build. |

## Consequences

**Positive**
- Fully offline, no CDN, no subscription; drawings and assets never leave the machine.
- Strict CSP preserved — no `'unsafe-eval'` in the renderer; the new grants are a narrow custom scheme.
- Reuses the established `attachment://` pattern, so the approach is familiar and auditable.

**Negative / watch points**
- ~18 MB of bundled fonts (full multilingual set incl. CJK) and a ~1.8 MB lazy subset-worker chunk. Trimmable later.
- Excalidraw still eagerly fires its esm.sh font *fallback* even when the local primary works; those requests are CSP-blocked and harmless (console noise only). A future cleanup could patch the fallback constant.
- SVG export with embedded fonts (harfbuzz) won't work under this CSP. Note embeds use PNG (canvas raster) instead, which needs no subsetting.
- **Any new IPC/scheme that accepts a renderer-supplied path must still be traversal-guarded** — the asset handler is, but it sets the precedent.

**Neutral**
- `EXCALIDRAW_ASSET_PATH` branches on `file:` vs http, so dev and prod take different (both local) asset routes.
