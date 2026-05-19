import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  useCreateNote,
  useDeleteNote,
  useNotesList,
  useNotesSearch,
} from './queries';
import { useUI } from '../../state/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

/**
 * Note list sidebar.
 *
 * Lists non-deleted notes ordered by updated_at desc (the service-side
 * default). Click selects; ⌘N creates and selects a new untitled note;
 * trash button soft-deletes.
 */
const SEARCH_DEBOUNCE_MS = 200;

export function NoteList(): JSX.Element {
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();
  const selectedNoteId = useUI((s) => s.selectedNoteId);
  const setSelectedNoteId = useUI((s) => s.setSelectedNoteId);

  // Search query state — debounced before being sent to the IPC so we
  // don't fire an FTS5 query per keystroke. When the debounced query is
  // non-empty, the list source switches from useNotesList to useNotesSearch.
  const [searchInput, setSearchInput] = useState('');
  const debouncedQuery = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const isSearching = debouncedQuery.trim().length > 0;

  const listQuery = useNotesList();
  const searchQuery = useNotesSearch(debouncedQuery);
  const notes = isSearching ? searchQuery.data : listQuery.data;
  const isLoading = isSearching ? searchQuery.isLoading : listQuery.isLoading;

  const createNew = useCallback(async (): Promise<void> => {
    const created = await createNote.mutateAsync({ title: '' });
    setSelectedNoteId(created.id);
  }, [createNote, setSelectedNoteId]);

  // ⌘N — new note. Listener re-registers when createNew changes; the
  // function is stable across renders thanks to useCallback above.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        void createNew();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [createNew]);

  const onDelete = async (id: string, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    if (selectedNoteId === id) setSelectedNoteId(null);
    await deleteNote.mutateAsync(id);
  };

  return (
    <aside className="flex h-full w-72 flex-col border-r border-gray-800 bg-gray-950">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Notes
        </h2>
        <button
          onClick={() => void createNew()}
          title="New note (⌘N)"
          className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        >
          + New
        </button>
      </div>
      <div className="border-b border-gray-800 px-3 py-2">
        <input
          type="search"
          aria-label="Search notes"
          placeholder="Search…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSearchInput('');
          }}
          className="w-full rounded-md bg-gray-900 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="px-4 py-3 text-sm text-gray-500">Loading…</p>
        ) : notes === undefined || notes.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">
            {isSearching
              ? `No results for "${debouncedQuery.trim()}".`
              : 'No notes yet. Press ⌘N to create one.'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-900">
            {notes.map((note) => (
              <li
                key={note.id}
                className={clsx(
                  'group relative flex items-start gap-2 transition',
                  selectedNoteId === note.id
                    ? 'bg-gray-900'
                    : 'hover:bg-gray-900/50',
                )}
              >
                <button
                  onClick={() => setSelectedNoteId(note.id)}
                  className={clsx(
                    'min-w-0 flex-1 px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500',
                    selectedNoteId === note.id
                      ? 'text-white'
                      : 'text-gray-300',
                  )}
                >
                  <div className="truncate text-sm font-medium">
                    {note.title || 'Untitled'}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-gray-500">
                    {note.body.slice(0, 60) || 'Empty'}
                  </div>
                </button>
                <button
                  onClick={(e) => void onDelete(note.id, e)}
                  aria-label={`Delete ${note.title || 'Untitled'}`}
                  className="absolute right-3 top-3 text-xs text-gray-400 opacity-0 transition hover:text-red-400 focus:opacity-100 focus:outline-none group-hover:opacity-60 hover:!opacity-100"
                  title="Delete"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
