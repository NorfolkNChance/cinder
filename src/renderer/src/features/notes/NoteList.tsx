import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  useCreateNote,
  useDeleteNote,
  useNotesList,
  useNotesSearch,
} from './queries';
import { useUI } from '../../state/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  isSupportedFile,
  importDroppedFiles,
} from './fileImport';

/**
 * Note list sidebar.
 *
 * Lists non-deleted notes ordered by updated_at desc (the service-side
 * default). Click selects; ⌘N creates and selects a new untitled note;
 * trash button soft-deletes.
 *
 * ## File import (drag-and-drop)
 *
 * The sidebar accepts dragged .md / .markdown / .html / .htm files.
 * When valid files are dragged over, a visual overlay appears. On drop:
 *   1. Each file is read with the Web File API (no Node/fs required).
 *   2. HTML files are converted to Markdown via turndown.
 *   3. Title is extracted from the first # heading (MD) or <title>/<h1> (HTML).
 *   4. A note is created for each file via the existing createNote mutation.
 *   5. The last imported note is automatically selected.
 *
 * Multiple files can be imported in a single drop.
 */
const SEARCH_DEBOUNCE_MS = 200;

export function NoteList(): JSX.Element {
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();
  const selectedNoteId = useUI((s) => s.selectedNoteId);
  const setSelectedNoteId = useUI((s) => s.setSelectedNoteId);

  // Search
  const [searchInput, setSearchInput] = useState('');
  const debouncedQuery = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const isSearching = debouncedQuery.trim().length > 0;

  const listQuery = useNotesList();
  const searchQuery = useNotesSearch(debouncedQuery);
  const notes = isSearching ? searchQuery.data : listQuery.data;
  const isLoading = isSearching ? searchQuery.isLoading : listQuery.isLoading;

  // ── Drag-and-drop ─────────────────────────────────────────────────────────

  /** null = idle, 'valid' = valid files over drop zone, 'invalid' = wrong type */
  const [dropState, setDropState] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const dragCounterRef = useRef(0); // track enter/leave nesting

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current !== 1) return; // already handling

    const files = Array.from(e.dataTransfer.items);
    const hasSupported = files.some(
      (item) =>
        item.kind === 'file' &&
        isSupportedFile({ name: item.getAsFile()?.name ?? '' } as File),
    );
    setDropState(hasSupported ? 'valid' : 'invalid');
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = dropState === 'valid' ? 'copy' : 'none';
  }, [dropState]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setDropState('idle');
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setDropState('idle');

      if (dropState !== 'valid') return;

      setImporting(true);
      setImportErrors([]);

      try {
        const results = await importDroppedFiles(e.dataTransfer);
        const errors: string[] = [];
        let lastCreatedId: string | null = null;

        for (const result of results) {
          if (!result.ok) {
            errors.push(
              result.error.kind === 'unsupported'
                ? `"${result.error.filename}" is not a supported file type.`
                : `Failed to read "${result.error.filename}": ${result.error.message}`,
            );
            continue;
          }
          const created = await createNote.mutateAsync({
            title: result.note.title,
            body: result.note.body,
          });
          lastCreatedId = created.id;
        }

        if (lastCreatedId !== null) setSelectedNoteId(lastCreatedId);
        if (errors.length > 0) setImportErrors(errors);
      } finally {
        setImporting(false);
      }
    },
    [dropState, createNote, setSelectedNoteId],
  );

  // ── Create / delete ───────────────────────────────────────────────────────

  const createNew = useCallback(async (): Promise<void> => {
    const created = await createNote.mutateAsync({ title: '' });
    setSelectedNoteId(created.id);
  }, [createNote, setSelectedNoteId]);

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative flex h-full flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => void handleDrop(e)}
    >
      {/* Drop overlay */}
      {dropState !== 'idle' && (
        <div
          className={clsx(
            'pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-lg border-2 transition-colors',
            dropState === 'valid'
              ? 'border-emerald-500 bg-emerald-950/60'
              : 'border-red-700 bg-red-950/40',
          )}
        >
          <span className="text-2xl">
            {dropState === 'valid' ? '📄' : '⛔'}
          </span>
          <span
            className={clsx(
              'text-sm font-medium',
              dropState === 'valid' ? 'text-emerald-300' : 'text-red-400',
            )}
          >
            {dropState === 'valid'
              ? 'Drop to import'
              : 'Unsupported file type'}
          </span>
          {dropState === 'valid' && (
            <span className="text-xs text-emerald-500">
              .md · .markdown · .html · .htm
            </span>
          )}
        </div>
      )}

      {/* Importing spinner */}
      {importing && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-gray-950/70">
          <span className="text-sm text-gray-400">Importing…</span>
        </div>
      )}

      {/* Header */}
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

      {/* Search */}
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

      {/* Import errors */}
      {importErrors.length > 0 && (
        <div className="border-b border-red-900 bg-red-950/40 px-4 py-2">
          {importErrors.map((err, i) => (
            <p key={i} className="text-xs text-red-400">
              {err}
            </p>
          ))}
          <button
            onClick={() => setImportErrors([])}
            className="mt-1 text-[11px] text-red-600 underline hover:text-red-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="px-4 py-3 text-sm text-gray-500">Loading…</p>
        ) : notes === undefined || notes.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-8 text-center">
            <p className="mb-2 text-sm text-gray-500">
              {isSearching
                ? `No results for "${debouncedQuery.trim()}".`
                : 'No notes yet.'}
            </p>
            {!isSearching && (
              <p className="text-xs text-gray-700">
                Press <kbd className="rounded border border-gray-700 bg-gray-900 px-1 font-mono text-[10px]">⌘N</kbd> to create one,
                or drag a <span className="text-gray-500">.md</span> or{' '}
                <span className="text-gray-500">.html</span> file here to import.
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-900" role="list" aria-label="Notes">
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
                  aria-label={note.title || 'Untitled'}
                  aria-current={selectedNoteId === note.id ? 'true' : undefined}
                  className={clsx(
                    'min-w-0 flex-1 px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500',
                    selectedNoteId === note.id
                      ? 'text-white'
                      : 'text-gray-300',
                  )}
                >
                  <div className="truncate text-sm font-medium" aria-hidden="true">
                    {note.title || 'Untitled'}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-gray-500" aria-hidden="true">
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

      {/* Drop hint at bottom */}
      <div className="border-t border-gray-800/50 px-4 py-2 text-center">
        <p className="text-[11px] text-gray-700">
          Drag <span className="text-gray-600">.md</span> or{' '}
          <span className="text-gray-600">.html</span> files to import
        </p>
      </div>
    </div>
  );
}
