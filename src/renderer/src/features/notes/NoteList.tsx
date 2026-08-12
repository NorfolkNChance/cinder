import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  useCreateNote,
  useDeleteNote,
  useNotesList,
  useNotesSearch,
} from './queries';
import { FolderTree } from './FolderTree';
import { useUI } from '../../state/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { importDroppedFiles } from './fileImport';

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
  const notesFolderScope = useUI((s) => s.notesFolderScope);

  // Search
  const [searchInput, setSearchInput] = useState('');
  const debouncedQuery = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const isSearching = debouncedQuery.trim().length > 0;

  const listQuery = useNotesList(notesFolderScope);
  const searchQuery = useNotesSearch(debouncedQuery);

  // When searching, filter results by current folder scope client-side.
  const rawSearchNotes = searchQuery.data;
  const filteredSearchNotes =
    rawSearchNotes === undefined
      ? undefined
      : notesFolderScope.kind === 'all'
      ? rawSearchNotes
      : notesFolderScope.kind === 'unfiled'
      ? rawSearchNotes.filter((n) => n.folderId === null)
      : rawSearchNotes.filter((n) => n.folderId === notesFolderScope.id);

  const notes = isSearching ? filteredSearchNotes : listQuery.data;
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

    // During dragenter, `getAsFile()` returns null in Electron's sandboxed
    // renderer — the actual File objects (including their names) are only
    // accessible on the `drop` event. We therefore check whether any item
    // is a file-kind and show the "valid" overlay optimistically. The real
    // extension check happens in `handleDrop` via `importDroppedFiles`.
    const hasFiles = Array.from(e.dataTransfer.items).some(
      (item) => item.kind === 'file',
    );
    setDropState(hasFiles ? 'valid' : 'invalid');
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
            bodyType: result.note.bodyType,
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
    // File the new note into the folder currently being viewed — otherwise
    // it lands in Unfiled and never appears in the sidebar list the user is
    // looking at, which reads as "the note didn't save".
    const created = await createNote.mutateAsync({
      title: '',
      ...(notesFolderScope.kind === 'folder'
        ? { folderId: notesFolderScope.id }
        : {}),
    });
    setSelectedNoteId(created.id);
  }, [createNote, setSelectedNoteId, notesFolderScope]);

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
              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/60'
              : 'border-red-700 bg-red-50 dark:bg-red-950/40',
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
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white/70 dark:bg-gray-950/70">
          <span className="text-sm text-gray-400">Importing…</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
          Notes
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={useUI.getState().openVaultImport}
            title="Import Obsidian vault"
            aria-label="Import Obsidian vault"
            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-gray-700 dark:text-gray-500 dark:hover:border-gray-600 dark:hover:text-gray-300"
          >
            ↓ Import
          </button>
          <button
            onClick={() => void createNew()}
            title="New note (⌘N)"
            className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            + New
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
        <input
          type="search"
          aria-label="Search notes"
          placeholder="Search…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSearchInput('');
          }}
          className="w-full rounded-md bg-gray-200 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-900 dark:text-gray-200 dark:placeholder-gray-500"
        />
      </div>

      {/* Folder tree */}
      <div className="border-b border-gray-200 dark:border-gray-800">
        <FolderTree />
      </div>

      {/* Import errors */}
      {importErrors.length > 0 && (
        <div className="border-b border-red-300 bg-red-50 px-4 py-2 dark:border-red-900 dark:bg-red-950/40">
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
              <p className="text-xs text-gray-400 dark:text-gray-700">
                Press <kbd className="rounded border border-gray-300 bg-gray-100 px-1 font-mono text-[10px] text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">⌘N</kbd> to create one,
                or drag a <span className="text-gray-500">.md</span> or{' '}
                <span className="text-gray-500">.html</span> file here to import.
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-900" role="list" aria-label="Notes">
            {notes.map((note) => (
              <li
                key={note.id}
                className={clsx(
                  'group relative flex items-start gap-2 transition',
                  selectedNoteId === note.id
                    ? 'bg-gray-200 dark:bg-gray-900'
                    : 'hover:bg-gray-100/50 dark:hover:bg-gray-900/50',
                )}
              >
                <button
                  onClick={() => setSelectedNoteId(note.id)}
                  aria-label={note.title || 'Untitled'}
                  aria-current={selectedNoteId === note.id ? 'true' : undefined}
                  className={clsx(
                    'min-w-0 flex-1 px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500',
                    selectedNoteId === note.id
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-700 dark:text-gray-300',
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

      {/* Drop hint + Trash at bottom */}
      <div className="flex items-center justify-between border-t border-gray-200/50 px-4 py-2 dark:border-gray-800/50">
        <p className="text-[11px] text-gray-400 dark:text-gray-700">
          Drag <span className="text-gray-500 dark:text-gray-600">.md</span> or{' '}
          <span className="text-gray-500 dark:text-gray-600">.html</span> files to import
        </p>
        <button
          onClick={useUI.getState().openTrash}
          title="Open Trash"
          aria-label="Open Trash"
          className="text-[11px] text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:text-gray-700 dark:hover:text-gray-400"
        >
          🗑 Trash
        </button>
      </div>
    </div>
  );
}
