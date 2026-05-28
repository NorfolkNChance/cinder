import { useState, useEffect, useRef, useCallback } from 'react';
import clsx from 'clsx';
import type { TaskWithLabels } from '../../../../shared/schemas/tasks';
import {
  useCompleteTask,
  useDeleteTask,
  useUpdateTask,
} from './queries';
import { formatDueDate, isOverdue } from '../../lib/dates';
import { describeRecurrence } from '../../../../shared/recurrence';
import { DatePicker } from '../../components/DatePicker';

interface TaskItemProps {
  task: TaskWithLabels;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  /** Controlled edit mode — set by the parent (e.g. `e` keyboard shortcut). */
  isEditing?: boolean;
  /** Called when the task enters or exits edit mode. */
  onEditingChange?: (editing: boolean) => void;
}

/**
 * A single task row.
 *
 * Normal mode:
 *   [ ✓ ]  Title…          [ Due chip ]  [ P# ]  [ ✎ ]  [ ✕ ]
 *
 * Edit mode (triggered by the ✎ button, double-clicking the title, or
 * the `e` keyboard shortcut on the selected row):
 *   [ ✓ ]  [ title input _________________________ ]
 *          [ description textarea _______________ ]
 *          [ Save ]  [ Cancel ]
 *
 * Edit mode is partly controlled (isEditing / onEditingChange) so the
 * parent can open it via keyboard shortcut, and partly self-contained
 * (the component tracks the draft values internally).
 */
export function TaskItem({
  task,
  isSelected = false,
  onSelect,
  isEditing: isEditingProp = false,
  onEditingChange,
}: TaskItemProps): JSX.Element {
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();

  // ── Edit-mode state ──────────────────────────────────────────────────────
  const [isEditingLocal, setIsEditingLocal] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [descDraft, setDescDraft] = useState(task.description);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Either the prop OR local state can open edit mode.
  const isEditing = isEditingProp || isEditingLocal;

  const openEdit = useCallback(() => {
    setTitleDraft(task.title);
    setDescDraft(task.description);
    setIsEditingLocal(true);
    onEditingChange?.(true);
    // Focus the title input after the DOM updates.
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }, [task.title, task.description, onEditingChange]);

  const closeEdit = useCallback(() => {
    setIsEditingLocal(false);
    onEditingChange?.(false);
  }, [onEditingChange]);

  const saveEdit = useCallback(() => {
    const trimmedTitle = titleDraft.trim();
    const trimmedDesc = descDraft.trim();
    // Only send a mutation if something actually changed.
    if (
      trimmedTitle !== task.title ||
      trimmedDesc !== task.description
    ) {
      updateTask.mutate({
        id: task.id,
        patch: {
          title: trimmedTitle,
          description: trimmedDesc,
        },
      });
    }
    closeEdit();
  }, [titleDraft, descDraft, task.id, task.title, task.description, updateTask, closeEdit]);

  // When the parent opens edit mode via the `e` shortcut, sync + focus.
  useEffect(() => {
    if (isEditingProp && !isEditingLocal) {
      setTitleDraft(task.title);
      setDescDraft(task.description);
      setIsEditingLocal(true);
      requestAnimationFrame(() => titleInputRef.current?.focus());
    }
  }, [isEditingProp]); // intentionally only on prop change

  // Reset drafts when a different task arrives (e.g. re-use of the component).
  useEffect(() => {
    if (!isEditing) {
      setTitleDraft(task.title);
      setDescDraft(task.description);
    }
  }, [task.id]); // only on task identity change

  // ── Normal handlers ──────────────────────────────────────────────────────
  const isComplete = task.completedAt !== null;

  const toggleComplete = (): void => {
    completeTask.mutate({ id: task.id, completed: !isComplete });
  };

  const onDelete = (e: React.MouseEvent): void => {
    e.stopPropagation();
    deleteTask.mutate(task.id);
  };

  const onDueDateChange = (value: string): void => {
    updateTask.mutate({
      id: task.id,
      patch: { dueDate: value === '' ? null : value },
    });
  };

  const onPriorityChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const priority = Number(e.target.value) as 1 | 2 | 3 | 4;
    updateTask.mutate({ id: task.id, patch: { priority } });
  };

  const dueDateInputValue =
    task.dueDate === null ? '' : task.dueDate.slice(0, 10);

  const onRowClick = (): void => {
    if (!isEditing) onSelect?.(task.id);
  };

  // ── Edit mode render ─────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <li
        className={clsx(
          'border-b border-gray-100 px-5 py-3 transition dark:border-gray-900',
          isSelected
            ? 'bg-emerald-900/30 ring-1 ring-inset ring-emerald-700'
            : 'bg-gray-100 dark:bg-gray-900/20',
        )}
      >
        <div className="flex items-start gap-3">
          {/* Checkbox — still operable during edit */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleComplete(); }}
            role="checkbox"
            aria-checked={isComplete}
            aria-label={isComplete ? 'Mark as incomplete' : 'Mark as complete'}
            className={clsx(
              'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded border-2 focus:outline-none focus:ring-2 focus:ring-emerald-500',
              isComplete
                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                : priorityCheckboxBorder(task.priority),
            )}
          >
            {isComplete ? <span aria-hidden>✓</span> : null}
          </button>

          {/* Edit fields */}
          <div className="flex-1 space-y-2">
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  saveEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  closeEdit();
                }
              }}
              placeholder="Task title"
              aria-label="Task title"
              className="w-full rounded-md border border-gray-400 bg-gray-100 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-500 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:placeholder-gray-600"
            />
            <textarea
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  closeEdit();
                }
              }}
              placeholder="Add a description… (optional)"
              aria-label="Task description"
              rows={2}
              className="w-full resize-none rounded-md border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-700 placeholder-gray-500 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:placeholder-gray-600"
            />

            {/* Description preview (only when non-empty before editing) */}
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); saveEdit(); }}
                className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                Save
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); closeEdit(); }}
                className="rounded-md px-3 py-1 text-xs text-gray-500 hover:bg-gray-200 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              >
                Cancel
              </button>
              <span className="ml-2 text-[11px] text-gray-700">
                Enter to save · Esc to cancel
              </span>
            </div>
          </div>
        </div>
      </li>
    );
  }

  // ── Normal mode render ───────────────────────────────────────────────────
  return (
    <li
      onClick={onRowClick}
      className={clsx(
        'group flex cursor-default items-center gap-3 border-b border-gray-100 px-5 py-2.5 transition dark:border-gray-900',
        isSelected
          ? 'bg-emerald-900/30 ring-1 ring-inset ring-emerald-700'
          : 'hover:bg-gray-100 dark:hover:bg-gray-900/40',
      )}
    >
      <button
        onClick={(e) => { e.stopPropagation(); toggleComplete(); }}
        role="checkbox"
        aria-checked={isComplete}
        aria-label={isComplete ? 'Mark as incomplete' : 'Mark as complete'}
        className={clsx(
          'inline-flex size-5 shrink-0 items-center justify-center rounded border-2 focus:outline-none focus:ring-2 focus:ring-emerald-500',
          isComplete
            ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
            : priorityCheckboxBorder(task.priority),
        )}
      >
        {isComplete ? <span aria-hidden>✓</span> : null}
      </button>

      {/* Title — double-click to edit */}
      <span
        onDoubleClick={(e) => {
          e.stopPropagation();
          openEdit();
        }}
        className={clsx(
          'min-w-0 flex-1 truncate text-sm',
          isComplete ? 'text-gray-500 line-through' : 'text-gray-800 dark:text-gray-200',
        )}
        title={
          task.description
            ? `${task.title}\n\n${task.description}`
            : task.title
        }
      >
        {task.title || <span className="italic text-gray-600">Untitled</span>}
        {/* Small description indicator */}
        {task.description.length > 0 && !isComplete && (
          <span
            className="ml-1.5 text-[10px] text-gray-600"
            aria-label="Has description"
            title={task.description}
          >
            ¶
          </span>
        )}
      </span>

      {task.labels.length > 0 && (
        <span className="flex shrink-0 items-center gap-1">
          {task.labels.map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center rounded border border-teal-800 px-1.5 py-0.5 text-[10px] text-teal-300"
              title={`Labelled @${l.name}`}
            >
              @{l.name}
            </span>
          ))}
        </span>
      )}

      {task.dueRecurrence !== null && (
        <span
          aria-label="Recurring task"
          title={describeRecurrence(task.dueRecurrence)}
          className="shrink-0 text-xs text-purple-400"
        >
          ↻
        </span>
      )}

      {/* Stop row-click propagation so opening the picker doesn't select the task */}
      <span onClick={(e) => e.stopPropagation()}>
        <DatePicker
          value={dueDateInputValue}
          onChange={onDueDateChange}
          label={`Due date for ${task.title || 'this task'}`}
          placeholder="📅"
          formatValue={(v) => formatDueDate(v)}
          className={clsx(
            'shrink-0 px-2 py-0.5',
            !isComplete && isOverdue(task.dueDate) && '!border-red-700 !text-red-400',
          )}
        />
      </span>

      <select
        value={task.priority}
        onChange={onPriorityChange}
        onClick={(e) => e.stopPropagation()}
        aria-label="Priority"
        title="Priority (1 = highest)"
        className="rounded-md border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
      >
        <option value={1}>P1</option>
        <option value={2}>P2</option>
        <option value={3}>P3</option>
        <option value={4}>P4</option>
      </select>

      {/* Edit button — visible on hover / when selected */}
      <button
        onClick={(e) => { e.stopPropagation(); openEdit(); }}
        aria-label={`Edit task ${task.title || 'untitled'}`}
        title="Edit (e)"
        className="text-xs text-gray-500 opacity-0 transition hover:text-emerald-400 focus:opacity-100 focus:outline-none group-hover:opacity-60 hover:!opacity-100"
      >
        ✎
      </button>

      <button
        onClick={onDelete}
        aria-label={`Delete task ${task.title || 'untitled'}`}
        title="Delete"
        className="text-xs text-gray-500 opacity-0 transition hover:text-red-400 focus:opacity-100 focus:outline-none group-hover:opacity-60 hover:!opacity-100"
      >
        ✕
      </button>
    </li>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function priorityCheckboxBorder(priority: number): string {
  switch (priority) {
    case 1:
      return 'border-red-500 hover:border-red-400';
    case 2:
      return 'border-orange-500 hover:border-orange-400';
    case 3:
      return 'border-blue-500 hover:border-blue-400';
    default:
      return 'border-gray-600 hover:border-gray-400';
  }
}
