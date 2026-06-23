// Classic (non-module) script — runs synchronously BEFORE the deferred module
// bundle (src/main.tsx) and therefore before @excalidraw/excalidraw initializes
// and reads window.EXCALIDRAW_ASSET_PATH.
//
// This MUST be a separate classic script, not a statement inside the module
// graph: Rollup may reorder a side-effect-only module relative to the Excalidraw
// module (no dependency edge between them), so the global could otherwise be set
// too late. It is served from our own origin ('self'), satisfying script-src.
//
// Points Excalidraw at the self-hosted assets copied into /excalidraw-assets/
// (see scripts/copy-excalidraw-assets.mjs) instead of its default esm.sh CDN —
// required for a local-first, offline, strict-CSP app.
//
// Under the dev server the document is http://localhost and the assets are
// same-origin, so a document-relative URL works and CSP 'self' covers it.
//
// In production the document is file://, whose opaque origin does NOT satisfy
// CSP 'self' — file:// fonts get blocked and Excalidraw falls back to its CDN.
// So we route through the custom excalidraw-asset:// scheme (a standard+secure
// origin served by the main process; see src/main/protocol/excalidraw-asset.ts),
// which the CSP allows explicitly.
window.EXCALIDRAW_ASSET_PATH =
  document.baseURI.startsWith('file:')
    ? 'excalidraw-asset://assets/'
    : new URL('excalidraw-assets/', document.baseURI).href;
