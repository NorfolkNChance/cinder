import { useState, useRef, useCallback, useEffect } from 'react';
import { useUI } from '../../state/ui';
import { useCreateTask } from '../tasks/queries';

interface AddTriageTodoProps {
  /** ID of the current note — stored on the task as sourceNoteId. */
  noteId: string;
  /** Title of the current note — offered as default task title. */
  noteTitle: string;
}

/**
 * "+ Todo" button in the NoteEditor header.
 *
 * Opens a small popover with a single text input. Pressing Enter (or
 * clicking the button) creates a task with `triage: 1` — it lands in
 * the Triage smart view waiting to be acknowledged and set up properly.
 *
 * The popover closes on Escape, on Enter (after creation), or when the
 * user clicks outside.
 */
export function AddTriageTodo({ noteId, noteTitle }: AddTriageTodoProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const createTask = useCreateTask();
  const showToast = useUI((s) => s.showToast);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus the input when the popover opens.
  useEffect(() => {
    if (open) {
      setTaskTitle('');
      // Small delay so the element is visible before we focus.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent): void => {
      if (
        containerRef.current !== null &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const submit = useCallback(async () => {
    const title = taskTitle.trim() || noteTitle.trim() || 'Untitled todo';
    await createTask.mutateAsync({ title, triage: 1, sourceNoteId: noteId });
    setOpen(false);
    showToast('Added to Triage — open Tasks › Triage to review', 'success');
  }, [taskTitle, noteTitle, createTask, showToast]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Add a todo from this note (lands in Triage)"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 transition hover:border-gray-400 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-200"
      >
        <span aria-hidden="true">＋</span>
        Todo
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Add todo to Triage"
          className="absolute right-0 top-full z-30 mt-1.5 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
            Add to Triage
          </p>
          <input
            ref={inputRef}
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              } else if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
            placeholder={noteTitle.trim() || 'Task title…'}
            aria-label="New todo title"
            className="mb-2 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-600"
          />
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-gray-400 dark:text-gray-600">
              Goes to Triage for setup · Enter to add · Esc to cancel
            </p>
            <button
              onClick={() => void submit()}
              disabled={createTask.isPending}
              className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
