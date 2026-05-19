import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { getSchema } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';

/**
 * The ProseMirror schema used by both the serialiser/deserialiser and the
 * editor itself. Built from TipTap's StarterKit so the document shape we
 * convert to/from markdown is identical to what the editor produces.
 *
 * Nodes/marks the serde layer handles:
 *   nodes: doc, paragraph, text, heading, blockquote, codeBlock,
 *          bulletList, orderedList, listItem, hardBreak, horizontalRule,
 *          image
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
const ConfiguredImage = Image.configure({
  inline: true,
  allowBase64: true,
});

export const editorExtensions = [StarterKit, ConfiguredImage] as const;

export const markdownSchema: Schema = getSchema([...editorExtensions]);
