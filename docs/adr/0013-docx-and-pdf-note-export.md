# 0013. Export notes to DOCX and PDF

Date: 2026-06-30  
Status: Accepted

---

## Context

Note export previously produced only self-contained Markdown (ADR-0010): a single
note → `.md`, or all notes → a folder of `.md` files, with `attachment://` images
inlined as `data:` URIs in the main process and live `drawing://` embeds
rasterised by the renderer beforehand. Markdown is the canonical storage format
and the most portable export, but users frequently need to hand a note to someone
who expects a Word document or a PDF (sharing, printing, archiving).

We wanted DOCX and PDF available everywhere note export already is — the editor
header `ExportMenu` and the command palette — without weakening the security
model (renderer never sees file paths; all I/O in the trusted main process) and
without taking on heavy or poorly-audited dependencies.

Two distinct rendering problems:

- **PDF** needs a layout/print engine. Electron already ships one (Chromium).
- **DOCX** is an OOXML zip with no native platform path; it needs a library.

## Decision

Add an output **format** to the note-export inputs (`ExportFormat = 'md' | 'docx'
| 'pdf'`, optional, defaulting to `'md'` in the service) and branch on it. Both
new formats are built from the **same fully-inlined Markdown** the `.md` export
already produces, so attachment/drawing inlining and the title-as-H1 rule are
shared verbatim (`withTitle()` + `inlineAttachments()` in `services/export.ts`).
Tasks (CSV) and the DB backup are unchanged — DOCX/PDF apply to notes only.

All rendering lives in a new main-process module `services/markdown-export.ts`:

- **PDF** — render Markdown → HTML with `markdown-it` (already a project dep),
  wrap it in a print-styled HTML document, write it to a temp file, and load it
  into an **offscreen `BrowserWindow`** with the same hardened `webPreferences`
  as the main window **plus `javascript: false`**, then call
  `webContents.printToPDF()`. No new dependency. The temp file is removed in a
  `finally`. A temp file (not a `data:` URL) is used because inlined images can
  push a `data:` URL past platform length limits.
- **DOCX** — add the pure-TypeScript [`docx`](https://www.npmjs.com/package/docx)
  library and map `markdown-it` block/inline tokens to docx primitives
  (headings, paragraphs, bold/italic/inline-code, links via `ExternalHyperlink`,
  images via `ImageRun`, bullet/ordered lists with per-list numbering restart,
  fenced/indented code, blockquotes, `hr`). `data:` images are decoded to buffers
  and sized by a small header parser (PNG/JPEG/GIF/BMP), capped at 600 px wide;
  unsupported formats (SVG/WebP) degrade to `[image: alt]` text.

`markdown-it` is bundled into the main output (it is a `devDependency`, so
`externalizeDepsPlugin` bundles rather than externalises it — it is pure JS).
`docx` is a `dependency`, so it is externalised and packaged into the app's
`node_modules` by electron-builder; `require('docx')` resolves the CJS build.

The `markdown-it` instance used for export sets `validateLink = () => true`: note
bodies are the user's own trusted local content, so no scheme should be silently
dropped (notably `data:` images). For PDF the offscreen window's CSP
(`img-src 'self' data: blob: attachment:`, no `script-src` execution, plus
`javascript:false`) remains the backstop; DOCX has no execution context at all.

## Alternatives considered

| Option | Why not chosen |
|--------|---------------|
| `html-to-docx` (HTML → DOCX) | Less of our own code, but less-maintained and pulls its own transitive deps to audit; the project is strict about dependency hygiene. `docx` is pure TS, MIT, `npm audit` clean. |
| Generate OOXML by hand | A real `.docx` is a multi-part zip of XML — fragile and high-effort to do well; reinvents `docx`. |
| Render PDF with a library (e.g. pdfkit/puppeteer) | Electron's `printToPDF` is built in (zero deps) and gives faithful Chromium layout from the HTML we already know how to produce. |
| Convert from the TipTap/ProseMirror doc instead of Markdown | Markdown is the canonical format and the inlining pipeline already targets it; reusing it keeps one source of truth and shares attachment/drawing handling. |
| Spawn an `<iframe>`/print in the renderer | File I/O and path handling must stay in the trusted main process; the renderer never touches paths or the filesystem. |

## Consequences

**Positive**
- DOCX and PDF are available wherever Markdown export is (single note, all notes;
  `ExportMenu` format pills + command-palette entries), reusing the existing
  inlining and title rules.
- PDF adds no dependency. DOCX adds one pure-JS, audit-clean library.
- Security model intact: all I/O in main, renderer supplies only IDs + format,
  the PDF window is sandboxed with scripting disabled.

**Negative / watch points**
- The Markdown→DOCX mapping covers common CommonMark constructs but is not
  exhaustive (e.g. tables, task-list checkboxes, nested mixed lists beyond a few
  levels). Extend `markdown-export.ts` as needs arise.
- DOCX image sizing relies on a small raster-header parser; SVG/WebP images fall
  back to alt text rather than embedding.
- PDF spins up an offscreen `BrowserWindow` per export — fine for interactive use;
  a future bulk "all notes → PDF" of very large vaults does this once per note.
- `docx` is externalised, so it must remain in `dependencies` (not
  `devDependencies`) or the packaged app will fail to `require` it.

**Neutral**
- `ExportFormat` is optional and defaults to `'md'`, so existing callers and the
  `.md` behaviour are unchanged.
- Bulk export of live `drawing://` embeds is still snapshot-only (inherited from
  ADR-0010): main has no canvas, so a folder export keeps drawing refs unless a
  note is exported singly.
