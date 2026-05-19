import { NoteList } from './features/notes/NoteList';
import { NoteEditor } from './features/notes/NoteEditor';
import { useUI } from './state/ui';

/**
 * Top-level layout: sidebar (note list) on the left, editor on the right.
 *
 * No router yet — single view, selection lives in the Zustand UI store.
 * Multiple windows / panes / tabs come later if needed.
 */
export default function App(): JSX.Element {
  const selectedNoteId = useUI((s) => s.selectedNoteId);

  return (
    <div className="flex h-screen min-h-0 bg-gray-950 text-white">
      <NoteList />
      <main className="flex-1 min-w-0 overflow-hidden">
        {selectedNoteId === null ? (
          <EmptyState />
        ) : (
          <NoteEditor noteId={selectedNoteId} />
        )}
      </main>
    </div>
  );
}

function EmptyState(): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h1 className="mb-3 text-3xl font-bold tracking-tight">Cinder</h1>
        <p className="text-gray-500">
          Select a note from the sidebar, or press{' '}
          <kbd className="rounded border border-gray-700 bg-gray-900 px-1.5 py-0.5 font-mono text-xs">
            ⌘N
          </kbd>{' '}
          to create one.
        </p>
      </div>
    </div>
  );
}
