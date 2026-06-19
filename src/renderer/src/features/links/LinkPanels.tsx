import { useMemo, useState } from 'react';
import { useUI } from '../../state/ui';
import { useAllTasksList } from '../tasks/queries';
import { useNotesList } from '../notes/queries';
import {
  useCreateLink,
  useDeleteLink,
  useLinksForNote,
  useLinksForTask,
} from './queries';

/**
 * Bidirectional note ↔ task link panels.
 *
 * `LinkedTasksPanel` lives in the NoteEditor and shows the tasks linked to a
 * note. `LinkedNotesPanel` lives in the task detail panel and shows the notes
 * linked to a task. Both share the `LinkAdder` picker and the same visual
 * language so the two directions feel symmetric.
 *
 * Clicking a linked item navigates across modes (notes ↔ tasks) using the
 * Zustand UI store — the same pattern as TriageCard's SourceNoteLink.
 */

// ── Shared picker ───────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  title: string;
}

/**
 * A compact "+ Link" control: a toggle button that reveals a filter input and
 * a list of matching candidates. Picking one calls `onPick` and collapses.
 */
function LinkAdder({
  label,
  candidates,
  onPick,
}: {
  label: string;
  candidates: readonly Candidate[];
  onPick: (id: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered =
      q === ''
        ? candidates
        : candidates.filter((c) => c.title.toLowerCase().includes(q));
    return filtered.slice(0, 8);
  }, [candidates, query]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded px-2 py-0.5 text-[11px] font-medium text-indigo-500 hover:bg-indigo-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:text-indigo-400 dark:hover:bg-gray-800"
      >
        + {label}
      </button>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            setQuery('');
          }
        }}
        placeholder={`Search to ${label.toLowerCase()}…`}
        aria-label={label}
        className="mb-1 w-full rounded border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
      />
      {matches.length === 0 ? (
        <p className="px-1 py-1 text-[11px] text-gray-400 dark:text-gray-600">
          No matches.
        </p>
      ) : (
        <ul className="max-h-40 overflow-y-auto">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => {
                  onPick(c.id);
                  setOpen(false);
                  setQuery('');
                }}
                className="block w-full truncate rounded px-2 py-1 text-left text-xs text-gray-700 hover:bg-indigo-50 focus:outline-none focus:bg-indigo-50 dark:text-gray-300 dark:hover:bg-gray-800 dark:focus:bg-gray-800"
              >
                {c.title.trim() === '' ? 'Untitled' : c.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LinkRow({
  icon,
  title,
  onOpen,
  onRemove,
  muted = false,
}: {
  icon: string;
  title: string;
  onOpen: () => void;
  onRemove: () => void;
  muted?: boolean;
}): JSX.Element {
  return (
    <li className="group flex items-center gap-1">
      <button
        onClick={onOpen}
        className={`flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:underline focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
          muted
            ? 'text-gray-400 line-through dark:text-gray-600'
            : 'text-indigo-500 dark:text-indigo-400'
        }`}
        title="Open"
      >
        <span aria-hidden="true">{icon}</span>
        <span className="truncate">{title}</span>
      </button>
      <button
        onClick={onRemove}
        aria-label={`Unlink ${title}`}
        className="rounded px-1 text-[11px] text-gray-400 opacity-0 transition hover:text-red-500 focus:opacity-100 focus:outline-none group-hover:opacity-100 dark:text-gray-600"
      >
        ✕
      </button>
    </li>
  );
}

// ── Note side: linked tasks ───────────────────────────────────────────────────

/** Linked-tasks section for the NoteEditor. */
export function LinkedTasksPanel({ noteId }: { noteId: string }): JSX.Element {
  const { data: linked } = useLinksForNote(noteId);
  const { data: allTasks } = useAllTasksList();
  const createLink = useCreateLink();
  const deleteLink = useDeleteLink();

  const setMode = useUI((s) => s.setMode);
  const setTaskScope = useUI((s) => s.setTaskScope);

  const linkedIds = useMemo(
    () => new Set((linked ?? []).map((t) => t.id)),
    [linked],
  );

  // Candidates: active, non-triage tasks not already linked.
  const candidates = useMemo<Candidate[]>(
    () =>
      (allTasks ?? [])
        .filter((t) => !linkedIds.has(t.id))
        .map((t) => ({ id: t.id, title: t.title })),
    [allTasks, linkedIds],
  );

  const items = linked ?? [];

  return (
    <section className="mt-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
          Linked tasks{items.length > 0 ? ` (${items.length})` : ''}
        </span>
        <LinkAdder
          label="Link task"
          candidates={candidates}
          onPick={(taskId) => createLink.mutate({ noteId, taskId })}
        />
      </div>
      {items.length > 0 && (
        <ul className="space-y-0.5">
          {items.map((t) => (
            <LinkRow
              key={t.id}
              icon="☑"
              title={t.title.trim() === '' ? 'Untitled task' : t.title}
              muted={t.completedAt !== null}
              onOpen={() => {
                setMode('tasks');
                setTaskScope(
                  t.projectId !== null
                    ? { kind: 'project', id: t.projectId }
                    : { kind: 'inbox' },
                );
              }}
              onRemove={() => deleteLink.mutate({ noteId, taskId: t.id })}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Task side: linked notes ───────────────────────────────────────────────────

/** Linked-notes section for the task detail panel. */
export function LinkedNotesPanel({ taskId }: { taskId: string }): JSX.Element {
  const { data: linked } = useLinksForTask(taskId);
  const { data: allNotes } = useNotesList({ kind: 'all' });
  const createLink = useCreateLink();
  const deleteLink = useDeleteLink();

  const setMode = useUI((s) => s.setMode);
  const setSelectedNoteId = useUI((s) => s.setSelectedNoteId);

  const linkedIds = useMemo(
    () => new Set((linked ?? []).map((n) => n.id)),
    [linked],
  );

  const candidates = useMemo<Candidate[]>(
    () =>
      (allNotes ?? [])
        .filter((n) => !linkedIds.has(n.id))
        .map((n) => ({ id: n.id, title: n.title })),
    [allNotes, linkedIds],
  );

  const items = linked ?? [];

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-widest text-gray-500 dark:text-gray-600">
          Linked notes{items.length > 0 ? ` (${items.length})` : ''}
        </span>
        <LinkAdder
          label="Link note"
          candidates={candidates}
          onPick={(noteId) => createLink.mutate({ noteId, taskId })}
        />
      </div>
      {items.length > 0 && (
        <ul className="space-y-0.5">
          {items.map((n) => (
            <LinkRow
              key={n.id}
              icon="↗"
              title={n.title.trim() === '' ? 'Untitled note' : n.title}
              onOpen={() => {
                setMode('notes');
                setSelectedNoteId(n.id);
              }}
              onRemove={() => deleteLink.mutate({ noteId: n.id, taskId })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
