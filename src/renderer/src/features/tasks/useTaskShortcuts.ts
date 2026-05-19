import { useEffect, useRef } from 'react';
import type { Task } from '../../../../shared/schemas/tasks';
import {
  useCompleteTask,
  useDeleteTask,
  useUpdateTask,
} from './queries';

/**
 * Global keyboard shortcuts for the Tasks pane.
 *
 *   q, ⌘N             → focus the quick-add input
 *   ↑ / ↓             → move selection through visible tasks
 *   1-4               → set priority on selected task
 *   Space             → toggle complete on selected task
 *   Backspace, Delete → soft-delete selected task
 *   Escape            → clear selection (and unfocus inputs)
 *
 * All bindings are no-ops when focus is in an input, textarea, select,
 * or contenteditable element — so typing in quick-add or the notes
 * editor never triggers a shortcut.
 *
 * State (`selectedTaskId`, `tasks`) is read through a ref so the
 * window listener stays mounted across re-renders. Re-binding on every
 * keystroke would be both wasteful and a source of subtle bugs around
 * focus loss in some browsers.
 */

interface Args {
  readonly tasks: readonly Task[];
  readonly selectedTaskId: string | null;
  readonly setSelectedTaskId: (id: string | null) => void;
  readonly focusQuickAdd: () => void;
}

export function useTaskShortcuts({
  tasks,
  selectedTaskId,
  setSelectedTaskId,
  focusQuickAdd,
}: Args): void {
  const stateRef = useRef({ tasks, selectedTaskId });
  stateRef.current = { tasks, selectedTaskId };

  const callbacksRef = useRef({ setSelectedTaskId, focusQuickAdd });
  callbacksRef.current = { setSelectedTaskId, focusQuickAdd };

  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (isEditableTarget(e.target)) return;

      const { tasks, selectedTaskId } = stateRef.current;
      const { setSelectedTaskId, focusQuickAdd } = callbacksRef.current;
      const selectedTask =
        selectedTaskId === null
          ? null
          : (tasks.find((t) => t.id === selectedTaskId) ?? null);

      // ── Quick-add focus ────────────────────────────────────────────────
      // Plain `q` opens quick-add. ⌘N matches the notes-side new-item
      // convention for symmetry; both fall through to the same focus call.
      if (
        e.key === 'q' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        e.preventDefault();
        focusQuickAdd();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        focusQuickAdd();
        return;
      }

      // ── Navigation ─────────────────────────────────────────────────────
      if (e.key === 'ArrowDown') {
        if (tasks.length === 0) return;
        e.preventDefault();
        const idx = tasks.findIndex((t) => t.id === selectedTaskId);
        const nextIdx = idx === -1 ? 0 : Math.min(idx + 1, tasks.length - 1);
        const next = tasks[nextIdx];
        if (next !== undefined) setSelectedTaskId(next.id);
        return;
      }
      if (e.key === 'ArrowUp') {
        if (tasks.length === 0) return;
        e.preventDefault();
        const idx = tasks.findIndex((t) => t.id === selectedTaskId);
        const nextIdx =
          idx === -1 ? tasks.length - 1 : Math.max(idx - 1, 0);
        const next = tasks[nextIdx];
        if (next !== undefined) setSelectedTaskId(next.id);
        return;
      }

      // ── Escape: clear selection (and blur whatever has focus) ──────────
      if (e.key === 'Escape') {
        if (selectedTaskId !== null) {
          e.preventDefault();
          setSelectedTaskId(null);
        }
        return;
      }

      // All remaining bindings act on a selected task. Bail if none.
      if (selectedTask === null) return;

      // ── Priority 1-4 ───────────────────────────────────────────────────
      if (
        ['1', '2', '3', '4'].includes(e.key) &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        const priority = Number(e.key) as 1 | 2 | 3 | 4;
        updateTask.mutate({
          id: selectedTask.id,
          patch: { priority },
        });
        return;
      }

      // ── Space: toggle complete ─────────────────────────────────────────
      if (e.key === ' ') {
        e.preventDefault();
        completeTask.mutate({
          id: selectedTask.id,
          completed: selectedTask.completedAt === null,
        });
        return;
      }

      // ── Backspace / Delete: soft-delete ───────────────────────────────
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        // Advance the selection BEFORE the delete fires so the highlight
        // doesn't vanish when the row disappears.
        const idx = tasks.findIndex((t) => t.id === selectedTask.id);
        const nextSibling =
          idx === -1
            ? null
            : (tasks[idx + 1] ?? tasks[idx - 1] ?? null);
        setSelectedTaskId(nextSibling?.id ?? null);
        deleteTask.mutate(selectedTask.id);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [updateTask, completeTask, deleteTask]);
}

/**
 * Should we treat the event's target as an editable surface (and
 * therefore ignore single-key shortcuts)? Covers <input>, <textarea>,
 * <select>, anything with contenteditable, and ProseMirror's editor
 * (which uses contenteditable internally).
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}
