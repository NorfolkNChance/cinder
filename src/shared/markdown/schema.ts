import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { getSchema } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import { WikiLink } from './extensions/WikiLink';

/**
 * The ProseMirror schema used by both the serialiser/deserialiser and the
 * editor itself. Built from TipTap's StarterKit so the document shape we
 * convert to/from markdown is identical to what the editor produces.
 *
 * Nodes/marks the serde layer handles:
 *   nodes: doc, paragraph, text, heading, blockquote, codeBlock,
 *          bulletList, orderedList, listItem, hardBreak, horizontalRule,
 *          image, table, tableRow, tableHeader, tableCell
 *   marks: bold, italic, code
 *
 * Image is layered on top of StarterKit. Per ARCHITECTURE.md §3.6, src
 * URLs are restricted at the CSP layer to attachment:// and data:; the
 * markdown serde itself is content-agnostic about the src string.
 *
 * Additional StarterKit features (strike, history undo/redo) are
 * included in the schema but have no markdown representation; history
 * is editor-only and strike isn't in CommonMark — both are out of scope
 * for the Phase 1 round-trip. Add them with extension-specific tests
 * when needed.
 */
/**
 * Configure Image as INLINE rather than block. CommonMark's image syntax
 * `![alt](src)` is inline — it lives inside a paragraph, not at the top
 * level. Making the ProseMirror node match that shape means a lone
 * image round-trips through markdown-it cleanly without the
 * block-image → paragraph-with-image wrapping mismatch.
 *
 * `allowBase64: true` permits `data:` URI sources (§3.2 CSP permits them
 * for img-src). The remote-image opt-in (§3.6) is enforced higher up
 * the stack — the schema layer is content-agnostic about the src string.
 */
export const ConfiguredImage = Image.configure({
  inline: true,
  allowBase64: true,
});

/**
 * Tables map to GFM pipe tables in markdown (markdown-it parses them in
 * its default preset; the serialiser emits them). Structural notes:
 *   - The first row is always the header row — GFM requires one, so the
 *     serialiser emits row 1 as `| … |` + delimiter and the deserialiser
 *     rebuilds row 1 as tableHeader cells. Tables inserted via the
 *     toolbar always have a header row, so this is lossless in practice.
 *   - Merged cells (colspan/rowspan) and per-column alignment have no
 *     GFM representation and are not exposed in the UI.
 *   - `resizable: false` — colwidth attrs would not survive the markdown
 *     round-trip, so column resizing is deliberately off.
 */
export const tableExtensions = [
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
] as const;

export const editorExtensions = [
  StarterKit,
  ConfiguredImage,
  WikiLink,
  ...tableExtensions,
] as const;

export const markdownSchema: Schema = getSchema([...editorExtensions]);
