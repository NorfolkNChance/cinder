import { useEditor, EditorContent } from '@tiptap/react';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef, useState } from 'react';
import {
  serialize,
  deserialize,
  editorExtensions,
} from '../../../../shared/markdown';
import { EditorToolbar } from './EditorToolbar';
import { FindInNote } from './FindInNote';
import { SearchHighlight } from './searchHighlight';
import { useSettings } from '../settings/useSettings';
import { ImageWithDrawingEmbed } from '../draw/DrawingEmbed';

// The editor swaps the shared base Image node for one with a live-drawing
// NodeView (renders drawing:// embeds). The node spec is identical, so the
// markdown serde schema is unaffected — only editor-side rendering differs.
// SearchHighlight is also editor-only (decorations, no schema impact) and
// powers the ⌘F find-in-note bar.
const editorOnlyExtensions = [
  ...editorExtensions.filter((e) => e.name !== 'image'),
  ImageWithDrawingEmbed,
  SearchHighlight,
];

interface TipTapEditorProps {
  /** Markdown body to load. Editor is recreated when `noteId` changes. */
  markdown: string;
  /** Stable identifier for the loaded note — used to detect note switches. */
  noteId: string;
  /** Fired on every editor update with the current markdown serialisation. */
  onChange: (markdown: string) => void;
  /** Fired when the user clicks a [[wiki link]] in the editor. */
  onWikiLinkClick?: (title: string) => void;
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
  onWikiLinkClick,
}: TipTapEditorProps): JSX.Element {
  // Reference to whether the editor is currently being programmatically
  // hydrated. Used to filter out the synthetic onUpdate that fires when
  // we call setContent during a note switch.
  const isHydratingRef = useRef(false);

  // Read the spellcheck preference. Default to true so the editor is usable
  // before settings load. We update the DOM attribute in a separate effect
  // rather than rebuilding the editor when the setting changes.
  const { settings } = useSettings();
  const spellcheck = settings?.['editor.spellcheck'] ?? true;

  // Keep noteId in a ref so the editor's pasteHandler (registered once on
  // construction) always sees the current id without rebuilding the editor.
  const noteIdRef = useRef(noteId);
  useEffect(() => {
    noteIdRef.current = noteId;
  }, [noteId]);

  // ⌘F find-in-note bar visibility.
  const [findOpen, setFindOpen] = useState(false);

  const editor = useEditor({
    // Schema-affecting extensions come from the shared module so the
    // editor and the markdown serde always agree on the document shape.
    // Placeholder is purely cosmetic (no schema impact) so it's added
    // here only.
    extensions: [
      ...editorOnlyExtensions,
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: deserialize(markdown).toJSON(),
    editorProps: {
      attributes: {
        // The .ProseMirror class (added by TipTap automatically) is styled
        // in index.css. Adding only layout-affecting utilities here.
        class: 'focus:outline-none min-h-[60vh] px-1',
        // Initial value — kept in sync with the setting via the effect below.
        spellcheck: 'true',
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
      // Intercept a click on a [[wiki link]] span inside the editor.
      handleClick: (_view, _pos, event) => {
        if (!onWikiLinkClick) return false;
        const target = event.target as HTMLElement | null;
        if (!target) return false;
        const el = target.closest('[data-wikilink]');
        if (!el) return false;
        const title = (el as HTMLElement).getAttribute('data-title');
        if (!title) return false;
        onWikiLinkClick(title);
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
    // A find bar from the previous note shouldn't linger across a switch.
    setFindOpen(false);
  }, [editor, noteId, markdown]);

  // ⌘F — open the find-in-note bar. ⌘⇧F is reserved for the global search
  // overlay (handled in App), so we ignore it here.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'f'
      ) {
        e.preventDefault();
        setFindOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Sync the spellcheck DOM attribute whenever the setting changes. We
  // cannot pass this through editorProps after construction (TipTap doesn't
  // re-apply attributes on re-render), so we mutate the DOM node directly.
  useEffect(() => {
    if (editor === null) return;
    editor.view.dom.setAttribute('spellcheck', spellcheck ? 'true' : 'false');
  }, [editor, spellcheck]);

  if (editor === null) {
    return <div className="px-1 text-gray-500">Loading editor…</div>;
  }

  return (
    <>
      <EditorToolbar editor={editor} noteId={noteId} />
      {findOpen && (
        <FindInNote editor={editor} onClose={() => setFindOpen(false)} />
      )}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <EditorContent id="tiptap-editor-content" editor={editor} />
      </div>
    </>
  );
}
