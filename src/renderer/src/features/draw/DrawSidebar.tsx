import clsx from 'clsx';
import { useUI } from '../../state/ui';
import { useDrawingsList, useCreateDrawing } from './queries';
import { useDeleteNote } from '../notes/queries';

/**
 * Sidebar panel for Draw mode. Lists every drawing (newest-updated first) and
 * a "New drawing" button. Selecting one opens it in the DrawMainPane; the
 * selection lives in Zustand (`selectedDrawingId`), independent of the other
 * modes' selections.
 */
export function DrawSidebar(): JSX.Element {
  const { data: drawings, isLoading } = useDrawingsList();
  const createDrawing = useCreateDrawing();
  const deleteNote = useDeleteNote();
  const selectedDrawingId = useUI((s) => s.selectedDrawingId);
  const setSelectedDrawingId = useUI((s) => s.setSelectedDrawingId);
  const showToast = useUI((s) => s.showToast);

  const handleNew = (): void => {
    createDrawing.mutate(
      { title: 'Untitled drawing' },
      {
        onSuccess: (drawing) => setSelectedDrawingId(drawing.id),
        onError: () => showToast('Failed to create drawing', 'error'),
      },
    );
  };

  const handleDelete = (id: string): void => {
    deleteNote.mutate(id, {
      onSuccess: () => {
        if (selectedDrawingId === id) setSelectedDrawingId(null);
      },
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 p-2 dark:border-gray-800">
        <button
          onClick={handleNew}
          disabled={createDrawing.isPending}
          className="w-full rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-60"
        >
          + New drawing
        </button>
      </div>
      <nav aria-label="Drawings" className="min-h-0 flex-1 overflow-y-auto p-1">
        {isLoading ? (
          <p className="p-3 text-xs text-gray-500">Loading…</p>
        ) : !drawings || drawings.length === 0 ? (
          <p className="p-3 text-xs text-gray-500">
            No drawings yet. Create one to start sketching.
          </p>
        ) : (
          <ul>
            {drawings.map((d) => (
              <li key={d.id} className="group flex items-center">
                <button
                  onClick={() => setSelectedDrawingId(d.id)}
                  className={clsx(
                    'min-w-0 flex-1 truncate rounded-md px-3 py-1.5 text-left text-sm',
                    d.id === selectedDrawingId
                      ? 'bg-gray-200 text-gray-900 dark:bg-gray-800 dark:text-white'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900',
                  )}
                >
                  {d.title || 'Untitled drawing'}
                </button>
                <button
                  onClick={() => handleDelete(d.id)}
                  aria-label={`Delete ${d.title || 'Untitled drawing'}`}
                  title="Delete drawing"
                  className="mr-1 rounded px-1.5 py-1 text-xs text-gray-400 opacity-0 hover:text-red-500 focus:opacity-100 group-hover:opacity-100"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </div>
  );
}
