import { useEditor, EditorContent } from '@tiptap/react';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef } from 'react';
import {
  serialize,
  deserialize,
  editorExtensions,
} from '../../../../shared/markdown';
import { EditorToolbar } from './EditorToolbar';

interface TipTapEditorProps {
  /** Markdown body to load. Editor is recreated when `noteId` changes. */
  markdown: string;
  /** Stable identifier for the loaded note — used to detect note switches. */
  noteId: string;
  /** Fired on every editor update with the current markdown serialisation. */
  onChange: (markdown: string) => void;
}

/**
 * Pull the first image File out of a ClipboardEvent or DragEvent's
 * DataTransfer. Returns null if no image is present.
 */
function firstImageFile(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
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

  // Keep noteId in a ref so the editor's pasteHandler (registered once on
  // construction) always sees the current id without rebuilding the editor.
  const noteIdRef = useRef(noteId);
  useEffect(() => {
    noteIdRef.current = noteId;
  }, [noteId]);

  const editor = useEditor({
    // Schema-affecting extensions come from the shared module so the
    // editor and the markdown serde always agree on the document shape.
    // Placeholder is purely cosmetic (no schema impact) so it's added
    // here only.
    extensions: [
      ...editorExtensions,
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: deserialize(markdown).toJSON(),
    editorProps: {
      attributes: {
        // The .ProseMirror class (added by TipTap automatically) is styled
        // in index.css. Adding only layout-affecting utilities here.
        class: 'focus:outline-none min-h-[60vh] px-1',
      },
      // Intercept a clipboard paste containing an image — bytes get
      // saved through the attachments IPC and the resulting URL is
      // inserted as an image node at the cursor. Returning true cancels
      // ProseMirror's default paste handling.
      handlePaste: (view, event) => {
        const file = firstImageFile(event.clipboardData);
        if (file === null) return false;
        event.preventDefault();
        void (async () => {
          const buffer = new Uint8Array(await file.arrayBuffer());
          const result = await window.api.attachments.save({
            noteId: noteIdRef.current,
            data: buffer,
            originalFilename: file.name,
            mimeType: file.type,
          });
          const imageNode = view.state.schema.nodes['image']?.create({
            src: result.url,
            alt: '',
            title: null,
          });
          if (imageNode) {
            view.dispatch(view.state.tr.replaceSelectionWith(imageNode));
          }
        })();
        return true;
      },
      // Same flow for drag-and-drop of an image file from Finder.
      handleDrop: (view, event) => {
        const file = firstImageFile(event.dataTransfer);
        if (file === null) return false;
        event.preventDefault();
        void (async () => {
          const buffer = new Uint8Array(await file.arrayBuffer());
          const result = await window.api.attachments.save({
            noteId: noteIdRef.current,
            data: buffer,
            originalFilename: file.name,
            mimeType: file.type,
          });
          const imageNode = view.state.schema.nodes['image']?.create({
            src: result.url,
            alt: '',
            title: null,
          });
          // Insert at the drop coordinates (where the user actually dropped),
          // not the current selection.
          const coords = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          if (imageNode && coords) {
            view.dispatch(view.state.tr.insert(coords.pos, imageNode));
          }
        })();
        return true;
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

  return (
    <>
      <EditorToolbar editor={editor} />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <EditorContent id="tiptap-editor-content" editor={editor} />
      </div>
    </>
  );
}
