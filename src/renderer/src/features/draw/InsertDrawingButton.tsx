import type { Editor } from '@tiptap/core';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useUI } from '../../state/ui';
import { useDrawingsList } from './queries';
import { drawingBodyToPng } from './exportDrawing';

/**
 * Toolbar control that inserts one of the user's drawings into the current note
 * as a PNG image.
 *
 * Flow: pick a drawing → load its scene from the DB → render it to PNG (canvas
 * raster, no font subsetting / eval) → persist as an attachment under this note
 * → insert an image node at the cursor. The embed is a static snapshot; to edit
 * the drawing, open it in Draw mode (live re-editable embeds are future work).
 *
 * The inserted node uses the same low-level schema insertion as the editor's
 * image paste handler, so it round-trips to `![](attachment://…)` markdown.
 */
export function InsertDrawingButton({
  editor,
  noteId,
}: {
  editor: Editor | null;
  noteId: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: drawings } = useDrawingsList();
  const showToast = useUI((s) => s.showToast);
  const setMode = useUI((s) => s.setMode);
  const setSelectedDrawingId = useUI((s) => s.setSelectedDrawingId);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const insert = (drawingId: string): void => {
    setOpen(false);
    setBusy(true);
    void (async () => {
      try {
        const drawing = await window.api.notes.get({ id: drawingId });
        if (!drawing) throw new Error('Drawing not found.');
        const png = await drawingBodyToPng(drawing.body);
        const result = await window.api.attachments.save({
          noteId,
          data: png,
          originalFilename: `${drawing.title || 'drawing'}.png`,
          mimeType: 'image/png',
        });
        if (editor) {
          const node = editor.schema.nodes['image']?.create({
            src: result.url,
            alt: drawing.title,
            title: null,
          });
          if (node) {
            editor.view.dispatch(editor.view.state.tr.replaceSelectionWith(node));
            editor.commands.focus();
          }
        }
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Failed to insert drawing',
          'error',
        );
      } finally {
        setBusy(false);
      }
    })();
  };

  const goCreateDrawing = (): void => {
    setOpen(false);
    setMode('draw');
    setSelectedDrawingId(null);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Insert drawing"
        aria-haspopup="true"
        aria-expanded={open}
        disabled={busy}
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className={clsx(
          'flex h-7 items-center gap-1 rounded px-1.5 text-sm transition',
          'text-gray-600 hover:bg-gray-200 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200',
          'focus:outline-none focus:ring-2 focus:ring-emerald-500',
          busy && 'cursor-wait opacity-50',
        )}
      >
        <span aria-hidden="true">✏️</span>
        <span className="text-xs">{busy ? 'Inserting…' : 'Drawing'}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-gray-300 bg-gray-100 py-1 shadow-xl dark:border-gray-700 dark:bg-gray-900"
        >
          {!drawings || drawings.length === 0 ? (
            <button
              role="menuitem"
              onMouseDown={(e) => {
                e.preventDefault();
                goCreateDrawing();
              }}
              className="block w-full px-3 py-2 text-left text-xs text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800"
            >
              No drawings yet — create one in Draw mode →
            </button>
          ) : (
            drawings.map((d) => (
              <button
                key={d.id}
                role="menuitem"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insert(d.id);
                }}
                className="block w-full truncate px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {d.title || 'Untitled drawing'}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
