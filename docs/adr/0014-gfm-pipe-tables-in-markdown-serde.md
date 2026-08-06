# 0014. Represent editor tables as GFM pipe tables in the markdown serde

Date: 2026-08-06  
Status: Accepted

---

## Context

Notes are stored as Markdown (the canonical, portable format), and the
serde layer (`src/shared/markdown/`) round-trips a CommonMark-compatible
subset between markdown text and the TipTap/ProseMirror document. Users
want tables in the editor. CommonMark has no table syntax, so adding
tables means stepping outside the strict CommonMark baseline for the
first time.

markdown-it (our tokeniser) parses GitHub-flavored-Markdown pipe tables
in its default preset — no plugin needed. TipTap ships a mature table
extension (`@tiptap/extension-table`, wrapping `prosemirror-tables`)
whose document model is richer than pipe tables: merged cells
(colspan/rowspan), resizable column widths, header cells anywhere, and
arbitrary block content per cell.

## Decision

Use GFM pipe tables as the markdown representation, and constrain the
editor-side table model to what pipe tables can express:

- **First row is always the header row.** GFM requires a header row, so
  the serialiser emits row 1 as the header + delimiter line, and the
  deserialiser rebuilds row 1 as `tableHeader` cells. Tables inserted
  from the toolbar use `withHeaderRow: true`, so this is lossless in
  practice.
- **No merged cells, no column resizing.** `resizable: false` is set on
  the Table extension and no merge/split commands are exposed in the
  toolbar. If a document nonetheless contains a colspan > 1 cell, the
  serialiser emits it once followed by empty cells to keep column counts
  consistent (degrade, don't crash).
- **Cells are single-line.** `|` in cell content is escaped as `\|`;
  any newline a cell produces (hard breaks, multiple paragraphs) is
  collapsed to a space on serialisation.
- **Column alignment is dropped** (`:---:` syntax) — the ProseMirror
  cells carry no alignment attr, so there is nothing to round-trip.

The table extensions live in `schema.ts` alongside StarterKit so the
editor and serde continue to share one schema. The pinned version must
match the other `@tiptap/*` packages exactly (npm resolves `^3.27.1` to
a newer minor whose `@tiptap/pm` peer conflicts).

## Alternatives considered

| Option | Why not chosen |
|--------|---------------|
| HTML tables in the markdown body | The pipeline forbids raw HTML (`html: false` in markdown-it, §3.6) — a security rule, not a preference. |
| Full-fidelity table model + custom syntax | Non-standard markdown breaks portability (Obsidian import/export, external editors), the core reason markdown is the storage format. |
| A dedicated `bodyType` for table-heavy notes | Massive complexity for a formatting feature; tables belong inside notes, not as a note type. |

## Consequences

**Positive**
- Tables survive export and interop with any GFM-aware tool (GitHub,
  Obsidian, VS Code preview). Obsidian vault import now brings tables in
  as real tables for free.
- PDF export renders tables with no changes (its markdown-it HTML
  pipeline already parses them).

**Negative / watch points**
- DOCX export (`markdown-export.ts`) walks markdown-it tokens explicitly
  and skips table tokens — tables are silently dropped from `.docx`
  output until it learns the token shape.
- Documents constructed programmatically with a non-header first row or
  merged cells will not round-trip identically (normalised to the
  canonical shape). Same class of limitation as adjacent same-type
  lists (see serialize.ts header comment).

**Neutral**
- The serde is no longer strictly CommonMark — it is CommonMark + GFM
  tables. Future GFM features (strikethrough, task lists) can follow the
  same pattern: markdown-it support first, constrained editor model
  second.
