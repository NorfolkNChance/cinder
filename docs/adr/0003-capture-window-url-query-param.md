# 0003. Shared renderer bundle for capture popup via `?mode=capture`

Date: 2026-05-27  
Status: Accepted

---

## Context

The menu-bar quick-capture feature (ADR-0002) requires a second `BrowserWindow`: a
small frameless popup that accepts a single task title, parses it with the NLP engine,
and creates a triage task. The popup is a completely different UI from the full
three-pane app.

Electron renders `BrowserWindow` content by loading a URL. The question was how to
serve the capture popup's UI without proliferating build outputs or maintaining a
separate React entry point.

Two bundling constraints made this non-trivial:

1. **electron-vite** produces a single renderer bundle with one entry (`main.tsx`). A
   fully separate capture entry would require a second vite config and a second build
   output — adding build complexity, increasing bundle size on disk, and requiring two
   separate HTML files to manage.

2. The capture window must use **identical `webPreferences`** to the main window
   (`sandbox: true`, `contextIsolation: true`, same preload). Any approach that works
   around this is a security regression.

---

## Decision

Re-use the existing renderer bundle for the capture popup. The `main.tsx` entry point
reads `window.location.search` at startup and branches on a `?mode=capture` query
parameter:

```tsx
const isCaptureMode =
  new URLSearchParams(window.location.search).get('mode') === 'capture';

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    {isCaptureMode ? (
      <QuickCaptureRoot />
    ) : (
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    )}
  </React.StrictMode>,
);
```

`tray.ts` appends `?mode=capture` when loading the capture window:

```ts
// dev
captureWin.loadURL(`${process.env.ELECTRON_RENDERER_URL}?mode=capture`);
// prod
captureWin.loadFile(join(__dirname, '../renderer/index.html'), {
  query: { mode: 'capture' },
});
```

`QuickCaptureRoot` wraps its own `QueryClientProvider` (isolated cache, no
cross-contamination with the main window's cache) and reads the system colour scheme
directly via `window.matchMedia` to avoid a settings IPC round-trip that would cause a
theme flash on first open.

---

## Alternatives considered

| Option | Why not chosen |
|--------|---------------|
| Separate vite entry point | Requires a second vite config, second HTML file, second bundle output. Build complexity doubles. The capture UI is ~150 lines — a dedicated build pipeline is disproportionate. |
| Electron `<webview>` tag | `webviewTag: false` is mandatory in `BrowserWindow` options. This is a security non-negotiable. |
| Dedicated renderer process with a separate preload | The preload surface would be identical to the main window's preload (both need `tasks.create`, `capture.hide`). Maintaining two near-identical preloads is error-prone. |
| Hard-coded static HTML (no React) | The capture form uses the same NLP parser (`parseQuickAdd`) and TanStack Query mutation as the main quick-add. Duplicating or reimplementing this logic without React and the shared code would be a maintenance liability and a possible divergence source. |
| `app://` custom protocol with separate document | Same downside as a separate entry point, plus custom protocol handling is additional surface area for the security model to cover. |

---

## Consequences

**Positive**
- One renderer bundle. `npm run build` produces the same output as before — no new
  artifacts, no new vite config entries.
- The capture window shares all `shared/` code (NLP parser, schemas, IPC channels)
  without any duplication.
- Security is identical: same `webPreferences`, same preload, same CSP. There is no
  relaxation for utility windows.
- The branch is purely additive: existing code paths are not touched by `isCaptureMode`.

**Negative / watch points**
- The full renderer bundle is loaded even for the capture popup. The popup only renders
  ~150 lines of UI but the JS that ships to it includes TipTap, the matrix view, etc.
  This is a code-splitting opportunity if startup performance becomes a concern.
- `?mode=capture` must be appended consistently in both dev and prod load paths. If
  `tray.ts` loads the window without the query parameter, the full app renders in the
  popup — a confusing failure mode. The two call sites are adjacent in the same file,
  making accidental divergence unlikely but not impossible.

**Neutral**
- The pattern is extensible: any future utility window (onboarding overlay, settings
  deep-link) can reuse the same URL-parameter branching approach without changes to the
  build system.
