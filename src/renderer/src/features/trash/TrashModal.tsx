import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUI } from '../../state/ui';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { queryKeys } from '../../lib/query-client';
import {
  useHardDeleteNote,
  useHardDeleteTask,
  useRestoreNote,
  useRestoreTask,
  useTrashedNotes,
  useTrashedTasks,
} from './queries';
import type { Note } from '../../../../shared/schemas/notes';
import type { Task } from '../../../../shared/schemas/tasks';

/**
 * Trash modal — lists soft-deleted notes and tasks with per-item Restore /
 * Delete-forever actions and a global Empty Trash.
 *
 * Destructive actions use a two-step inline confirmation (click once →
 * button arms, click again → executes) instead of a native confirm() so the
 * flow stays keyboard-accessible inside the focus trap.
 */

type Tab = 'notes' | 'tasks';

/** "12 Aug 2026" from an ISO timestamp — deletion dates don't need time. */
function formatDeletedAt(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Human label for a trashed note's kind, or null for a plain note. */
function noteKind(note: Note): string | null {
  if (note.dailyDate !== null) return 'Daily';
  if (note.bodyType === 'excalidraw') return 'Drawing';
  if (note.bodyType === 'html') return 'HTML';
  return null;
}

export function TrashModal(): JSX.Element | null {
  const isOpen = useUI((s) => s.trashOpen);
  const close = useUI((s) => s.closeTrash);
  const showToast = useUI((s) => s.showToast);
  const [tab, setTab] = useState<Tab>('notes');
  /** Id of the row (or 'EMPTY_ALL') whose destructive button is armed. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useFocusTrap(panelRef, isOpen);

  const notesQuery = useTrashedNotes(isOpen);
  const tasksQuery = useTrashedTasks(isOpen);
  const restoreNote = useRestoreNote();
  const restoreTask = useRestoreTask();
  const hardDeleteNote = useHardDeleteNote();
  const hardDeleteTask = useHardDeleteTask();

  // Close on Escape; disarm any pending confirmation first.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (confirming !== null) setConfirming(null);
        else close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, close, confirming]);

  // Reset transient state whenever the modal reopens.
  useEffect(() => {
    if (isOpen) {
      setConfirming(null);
      setEmptying(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const trashedNotes = notesQuery.data ?? [];
  const trashedTasks = tasksQuery.data ?? [];
  const isEmpty = trashedNotes.length === 0 && trashedTasks.length === 0;

  /**
   * Permanently delete everything in both tabs. Sequential so a failure
   * mid-way leaves a consistent remainder; a single invalidation at the
   * end refreshes the lists.
   */
  const emptyTrash = async (): Promise<void> => {
    setEmptying(true);
    let failed = 0;
    for (const note of trashedNotes) {
      try {
        await window.api.notes.hardDelete({ id: note.id });
      } catch {
        failed++;
      }
    }
    for (const task of trashedTasks) {
      try {
        await window.api.tasks.hardDelete({ id: task.id });
      } catch {
        failed++;
      }
    }
    setEmptying(false);
    setConfirming(null);
    void qc.invalidateQueries({ queryKey: queryKeys.trash.all });
    showToast(
      failed === 0 ? 'Trash emptied' : `Trash emptied (${failed} item(s) failed)`,
      failed === 0 ? 'success' : 'error',
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Trash"
        aria-modal="true"
        className="flex h-[480px] w-[640px] flex-col overflow-hidden rounded-xl border border-gray-300 bg-gray-100 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
            <span aria-hidden="true">🗑</span> Trash
          </h2>
          <div className="flex items-center gap-3">
            {!isEmpty &&
              (confirming === 'EMPTY_ALL' ? (
                <button
                  onClick={() => void emptyTrash()}
                  disabled={emptying}
                  className="rounded border border-red-400 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70"
                >
                  {emptying ? 'Emptying…' : 'Click again to empty everything'}
                </button>
              ) : (
                <button
                  onClick={() => setConfirming('EMPTY_ALL')}
                  className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-500 hover:border-red-400 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 dark:border-gray-700 dark:text-gray-400 dark:hover:border-red-700 dark:hover:text-red-400"
                >
                  Empty Trash…
                </button>
              ))}
            <button
              onClick={close}
              aria-label="Close trash"
              className="text-gray-500 transition-colors hover:text-gray-700 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Trash contents"
          className="flex gap-1 border-b border-gray-200 px-6 pt-3 dark:border-gray-800"
        >
          {(
            [
              ['notes', `Notes (${trashedNotes.length})`],
              ['tasks', `Tasks (${trashedTasks.length})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => {
                setTab(value);
                setConfirming(null);
              }}
              className={`rounded-t-md px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 ${
                tab === value
                  ? 'border border-b-0 border-gray-200 bg-white text-gray-800 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-950">
          {tab === 'notes' ? (
            <TrashList
              items={trashedNotes.map((n) => ({
                id: n.id,
                title: n.title || 'Untitled',
                badge: noteKind(n),
                deletedAt: n.deletedAt,
              }))}
              loading={notesQuery.isLoading}
              emptyMessage="No notes in the Trash."
              confirming={confirming}
              setConfirming={setConfirming}
              onRestore={(id) => restoreNote.mutate(id)}
              onHardDelete={(id) => {
                hardDeleteNote.mutate(id);
                setConfirming(null);
              }}
            />
          ) : (
            <TrashList
              items={trashedTasks.map((t: Task) => ({
                id: t.id,
                title: t.title || 'Untitled',
                badge: t.triage === 1 ? 'Triage' : null,
                deletedAt: t.deletedAt,
              }))}
              loading={tasksQuery.isLoading}
              emptyMessage="No tasks in the Trash."
              confirming={confirming}
              setConfirming={setConfirming}
              onRestore={(id) => restoreTask.mutate(id)}
              onHardDelete={(id) => {
                hardDeleteTask.mutate(id);
                setConfirming(null);
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-2 dark:border-gray-800">
          <p className="text-[11px] text-gray-500 dark:text-gray-600">
            Restored items return to where they were. Items are removed
            permanently by "Delete forever", "Empty Trash", or the automatic
            purge (see Settings → Trash).
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Row list ─────────────────────────────────────────────────────────────────

interface TrashRow {
  readonly id: string;
  readonly title: string;
  readonly badge: string | null;
  readonly deletedAt: string | null;
}

function TrashList({
  items,
  loading,
  emptyMessage,
  confirming,
  setConfirming,
  onRestore,
  onHardDelete,
}: {
  items: readonly TrashRow[];
  loading: boolean;
  emptyMessage: string;
  confirming: string | null;
  setConfirming: (id: string | null) => void;
  onRestore: (id: string) => void;
  onHardDelete: (id: string) => void;
}): JSX.Element {
  if (loading) {
    return <p className="px-6 py-4 text-sm text-gray-500">Loading…</p>;
  }
  if (items.length === 0) {
    return <p className="px-6 py-8 text-center text-sm text-gray-500">{emptyMessage}</p>;
  }
  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-900" role="list">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 px-6 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm text-gray-800 dark:text-gray-200">
                {item.title}
              </span>
              {item.badge && (
                <span className="flex-shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {item.badge}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-600">
              Deleted {formatDeletedAt(item.deletedAt)}
            </p>
          </div>
          <button
            onClick={() => onRestore(item.id)}
            className="flex-shrink-0 rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:border-emerald-500 hover:text-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-gray-700 dark:text-gray-400 dark:hover:border-emerald-600 dark:hover:text-emerald-400"
          >
            Restore
          </button>
          {confirming === item.id ? (
            <button
              onClick={() => onHardDelete(item.id)}
              className="flex-shrink-0 rounded border border-red-400 bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70"
            >
              Click again to confirm
            </button>
          ) : (
            <button
              onClick={() => setConfirming(item.id)}
              className="flex-shrink-0 rounded border border-gray-300 px-2 py-1 text-xs text-gray-500 hover:border-red-400 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 dark:border-gray-700 dark:text-gray-400 dark:hover:border-red-700 dark:hover:text-red-400"
            >
              Delete forever…
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
