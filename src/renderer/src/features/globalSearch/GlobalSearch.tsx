import { useEffect, useMemo, useRef, useState } from 'react';
import { useUI } from '../../state/ui';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useNotesSearch } from '../notes/queries';
import { useTasksSearch } from '../tasks/queries';
import type { Note } from '../../../../shared/schemas/notes';
import type { TaskWithLabels } from '../../../../shared/schemas/tasks';

/**
 * ⌘⇧F application-wide content search.
 *
 * Distinct from the ⌘K command palette (which navigates to commands and
 * scopes): this overlay searches the *content* of everything the app
 * stores — notes (regular, daily, drawings, HTML), and tasks — and jumps
 * straight to the matching item in the right mode.
 *
 *   - Notes go through the existing FTS5 index (`notes.search`), which spans
 *     every note type since it filters only `deleted_at IS NULL`.
 *   - Tasks go through a substring scan (`tasks.search`) over title +
 *     description, including completed and triage tasks.
 *
 * Keyboard: ↑/↓ move across the flattened result list, Enter opens, Escape
 * closes. Selecting a result sets the appropriate mode + selection and
 * closes the overlay.
 */

const DEBOUNCE_MS = 180;

type Result =
  | { kind: 'note'; note: Note }
  | { kind: 'task'; task: TaskWithLabels };

export function GlobalSearch(): JSX.Element | null {
  const isOpen = useUI((s) => s.globalSearchOpen);
  const close = useUI((s) => s.closeGlobalSearch);

  const setMode = useUI((s) => s.setMode);
  const setNotesFolderScope = useUI((s) => s.setNotesFolderScope);
  const setSelectedNoteId = useUI((s) => s.setSelectedNoteId);
  const setSelectedDrawingId = useUI((s) => s.setSelectedDrawingId);
  const setSelectedDailyDate = useUI((s) => s.setSelectedDailyDate);
  const setDailySelectedNoteId = useUI((s) => s.setDailySelectedNoteId);
  const setTaskScope = useUI((s) => s.setTaskScope);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const debounced = useDebouncedValue(query, DEBOUNCE_MS);
  const trimmed = debounced.trim();

  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useFocusTrap(panelRef, isOpen);

  // Reset when the overlay opens (focus trap handles the initial focus).
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  const notesQuery = useNotesSearch(trimmed);
  const tasksQuery = useTasksSearch(trimmed);

  const results = useMemo<Result[]>(() => {
    const noteResults: Result[] = (notesQuery.data ?? []).map((note) => ({
      kind: 'note',
      note,
    }));
    const taskResults: Result[] = (tasksQuery.data ?? []).map((task) => ({
      kind: 'task',
      task,
    }));
    return [...noteResults, ...taskResults];
  }, [notesQuery.data, tasksQuery.data]);

  // Clamp the active index whenever the result set changes.
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, results.length - 1)));
  }, [results.length]);

  // Keep the active row scrolled into view.
  useEffect(() => {
    const li = listRef.current?.querySelector(`[data-result-index="${activeIndex}"]`);
    li?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function openResult(result: Result): void {
    if (result.kind === 'note') {
      const note = result.note;
      if (note.dailyDate !== null) {
        setMode('daily');
        setSelectedDailyDate(note.dailyDate);
        setDailySelectedNoteId(note.id);
      } else if (note.bodyType === 'excalidraw') {
        setMode('draw');
        setSelectedDrawingId(note.id);
      } else {
        // Reset the folder scope so the note is visible regardless of which
        // folder the Notes sidebar was last filtered to.
        setNotesFolderScope({ kind: 'all' });
        setMode('notes');
        setSelectedNoteId(note.id);
      }
    } else {
      const task = result.task;
      setMode('tasks');
      if (task.triage === 1) {
        setTaskScope({ kind: 'triage' });
      } else if (task.projectId !== null) {
        setTaskScope({ kind: 'project', id: task.projectId });
      } else {
        setTaskScope({ kind: 'inbox' });
      }
    }
    close();
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter': {
        e.preventDefault();
        const result = results[activeIndex];
        if (result) openResult(result);
        break;
      }
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  }

  if (!isOpen) return null;

  const isLoading = notesQuery.isLoading || tasksQuery.isLoading;
  const noteCount = notesQuery.data?.length ?? 0;
  const taskCount = tasksQuery.data?.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-gray-300 bg-gray-100 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        role="dialog"
        aria-label="Search everything"
        aria-modal="true"
      >
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-gray-300 px-4 py-3 dark:border-gray-700">
          <span className="text-gray-500 dark:text-gray-500" aria-hidden="true">🔍</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search notes and tasks…"
            aria-label="Search everything"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={results.length > 0}
            aria-controls="global-search-listbox"
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-500 focus:outline-none dark:text-gray-100 dark:placeholder-gray-600"
          />
          {query.length > 0 && (
            <button
              onClick={() => setQuery('')}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-600 dark:hover:text-gray-400"
            >
              clear
            </button>
          )}
        </div>

        {/* Results */}
        <ul
          ref={listRef}
          id="global-search-listbox"
          className="max-h-[60vh] overflow-y-auto py-1"
          role="listbox"
          aria-label="Search results"
        >
          {trimmed.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-600">
              Type to search across all your notes and tasks.
            </li>
          ) : isLoading && results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-600">
              Searching…
            </li>
          ) : results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-600">
              No notes or tasks match "{trimmed}"
            </li>
          ) : (
            <ResultList
              results={results}
              query={trimmed}
              noteCount={noteCount}
              taskCount={taskCount}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
              openResult={openResult}
            />
          )}
        </ul>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t border-gray-200 px-4 py-2 text-[11px] text-gray-500 dark:border-gray-800 dark:text-gray-600">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

// ── Result list ────────────────────────────────────────────────────────────────

function ResultList({
  results,
  query,
  noteCount,
  taskCount,
  activeIndex,
  setActiveIndex,
  openResult,
}: {
  results: Result[];
  query: string;
  noteCount: number;
  taskCount: number;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  openResult: (r: Result) => void;
}): JSX.Element {
  return (
    <>
      {results.map((result, index) => {
        // Section headers appear before the first note and first task.
        const header =
          index === 0 && result.kind === 'note'
            ? `Notes (${noteCount})`
            : result.kind === 'task' &&
                (index === 0 || results[index - 1]?.kind === 'note')
              ? `Tasks (${taskCount})`
              : null;
        return (
          <div key={result.kind === 'note' ? `n:${result.note.id}` : `t:${result.task.id}`}>
            {header !== null && (
              <li
                className="px-4 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-600"
                role="presentation"
              >
                {header}
              </li>
            )}
            <ResultRow
              result={result}
              query={query}
              index={index}
              isActive={index === activeIndex}
              setActiveIndex={setActiveIndex}
              openResult={openResult}
            />
          </div>
        );
      })}
    </>
  );
}

function ResultRow({
  result,
  query,
  index,
  isActive,
  setActiveIndex,
  openResult,
}: {
  result: Result;
  query: string;
  index: number;
  isActive: boolean;
  setActiveIndex: (i: number) => void;
  openResult: (r: Result) => void;
}): JSX.Element {
  const { icon, title, subtitle } =
    result.kind === 'note'
      ? {
          icon: noteIcon(result.note),
          title: result.note.title || 'Untitled',
          subtitle: makeSnippet(result.note.body, query, result.note.bodyType),
        }
      : {
          icon: result.task.completedAt !== null ? '☑' : '⬜',
          title: result.task.title,
          subtitle: makeSnippet(result.task.description, query, 'markdown'),
        };

  return (
    <li
      data-result-index={index}
      role="option"
      aria-selected={isActive}
      onMouseEnter={() => setActiveIndex(index)}
      onClick={() => openResult(result)}
      className={`flex cursor-pointer items-start gap-3 px-4 py-2 text-sm ${
        isActive
          ? 'bg-gray-200 text-gray-900 dark:bg-gray-800 dark:text-white'
          : 'text-gray-700 hover:bg-gray-200/50 dark:text-gray-300 dark:hover:bg-gray-800/50'
      }`}
    >
      <span className="mt-0.5 w-5 shrink-0 text-center text-base leading-none" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {highlight(title, query)}
        </span>
        {subtitle !== '' && (
          <span className="block truncate text-xs text-gray-500 dark:text-gray-500">
            {highlight(subtitle, query)}
          </span>
        )}
      </span>
    </li>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function noteIcon(note: Note): string {
  if (note.dailyDate !== null) return '📆';
  if (note.bodyType === 'excalidraw') return '✏️';
  if (note.bodyType === 'html') return '🌐';
  return '📝';
}

/**
 * Build a plain-text snippet from a note/task body, windowed around the
 * first occurrence of the query when possible. Markdown/HTML markup is
 * stripped so the preview reads cleanly.
 */
function makeSnippet(
  body: string,
  query: string,
  bodyType: string,
): string {
  if (body === '') return '';
  // Drawing scenes are JSON — not worth previewing.
  if (bodyType === 'excalidraw') return '';

  let text = body;
  if (bodyType === 'html') {
    text = text.replace(/<[^>]*>/g, ' ');
  }
  // Light markdown cleanup — drop the common inline markers and collapse
  // whitespace. This is a preview, not a parser, so it stays cheap.
  text = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → text
    .replace(/[#>*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text === '') return '';

  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  const MAX = 140;
  if (idx <= 0) return text.slice(0, MAX) + (text.length > MAX ? '…' : '');

  const start = Math.max(0, idx - 40);
  const slice = text.slice(start, start + MAX);
  return (start > 0 ? '…' : '') + slice + (start + MAX < text.length ? '…' : '');
}

/**
 * Render `text` with case-insensitive occurrences of `query` wrapped in a
 * highlighted <mark>. Returns a fragment of strings + elements.
 */
function highlight(text: string, query: string): React.ReactNode {
  if (query === '') return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  let idx = lower.indexOf(q, from);
  let key = 0;
  while (idx !== -1) {
    if (idx > from) parts.push(text.slice(from, idx));
    parts.push(
      <mark
        key={key++}
        className="rounded bg-amber-200 text-gray-900 dark:bg-amber-500/40 dark:text-white"
      >
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    from = idx + q.length;
    idx = lower.indexOf(q, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}
