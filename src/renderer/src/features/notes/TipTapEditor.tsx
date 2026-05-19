import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef } from 'react';
import { serialize, deserialize } from '../../../../shared/markdown';

interface TipTapEditorProps {
  /** Markdown body to load. Editor is recreated when `noteId` changes. */
  markdown: string;
  /** Stable identifier for the loaded note — used to detect note switches. */
  noteId: string;
  /** Fired on every editor update with the current markdown serialisation. */
  onChange: (markdown: string) => void;
}

/**
 * Markdown-backed TipTap editor.
 *
 * Lifecycle:
 *   - Mount: parse `markdown` to ProseMirror JSON via deserialize, hand
 *     to TipTap as initial content.
 *   - Per keystroke: TipTap's onUpdate fires → we re-serialise the doc
 *     to markdown and bubble it up via onChange. Debouncing the resulting
 *     save IPC is the parent's responsibility (useDebouncedCallback).
 *   - Note switch (noteId change): we replace editor content with the
 *     new markdown, suppressing the onChange echo so a switch doesn't
 *     register as an edit.
 */
export function TipTapEditor({
  markdown,
  noteId,
  onChange,
}: TipTapEditorProps): JSX.Element {
  // Reference to whether the editor is currently being programmatically
  // hydrated. Used to filter out the synthetic onUpdate that fires when
  // we call setContent during a note switch.
  const isHydratingRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Heading levels — default is 1-6, leave open.
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        // CodeBlock uses StarterKit's lowlight-less variant for now;
        // syntax highlighting comes in a later milestone.
        codeBlock: { HTMLAttributes: { class: 'cinder-codeblock' } },
      }),
      Placeholder.configure({
        placeholder: 'Start writing…',
      }),
    ],
    content: deserialize(markdown).toJSON(),
    editorProps: {
      attributes: {
        // The .ProseMirror class (added by TipTap automatically) is styled
        // in index.css. Adding only layout-affecting utilities here.
        class: 'focus:outline-none min-h-[60vh] px-1',
      },
    },
    onUpdate: ({ editor: e }) => {
      if (isHydratingRef.current) return;
      const md = serialize(e.state.doc);
      onChange(md);
    },
  });

  // Reload content when the note switches. We compare noteId because the
  // markdown string itself may legitimately not change (e.g. saving an
  // unchanged note and rebuilding it) and rehydrating in that case would
  // wipe the user's cursor for nothing.
  const lastNoteIdRef = useRef(noteId);
  useEffect(() => {
    if (editor === null) return;
    if (lastNoteIdRef.current === noteId) return;
    lastNoteIdRef.current = noteId;

    isHydratingRef.current = true;
    editor.commands.setContent(deserialize(markdown).toJSON(), false);
    isHydratingRef.current = false;
  }, [editor, noteId, markdown]);

  if (editor === null) {
    return <div className="px-1 text-gray-500">Loading editor…</div>;
  }

  return <EditorContent editor={editor} />;
}
