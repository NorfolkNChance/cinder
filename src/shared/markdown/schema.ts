import StarterKit from '@tiptap/starter-kit';
import { getSchema } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';

/**
 * The ProseMirror schema used by both the serialiser/deserialiser and the
 * editor itself. Built from TipTap's StarterKit so the document shape we
 * convert to/from markdown is identical to what the editor produces.
 *
 * StarterKit baseline nodes/marks (those handled by the serde layer):
 *   nodes: doc, paragraph, text, heading, blockquote, codeBlock,
 *          bulletList, orderedList, listItem, hardBreak, horizontalRule
 *   marks: bold, italic, code
 *
 * Additional StarterKit features (strike, history undo/redo) are included
 * in the schema but have no markdown representation; history is editor-only,
 * and strike isn't part of CommonMark — both are out of scope for the Phase 1
 * round-trip. Add them with extension-specific tests when needed.
 */
export const markdownSchema: Schema = getSchema([StarterKit]);
