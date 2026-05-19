import clsx from 'clsx';
import type { Task } from '../../../../shared/schemas/tasks';
import {
  useCompleteTask,
  useDeleteTask,
  useUpdateTask,
} from './queries';
import { formatDueDate, isOverdue } from '../../lib/dates';

interface TaskItemProps {
  task: Task;
}

/**
 * A single task row.
 *
 *   [ ✓ ]  Title…                      [ Due chip ]  [ P# ]  [ ✕ ]
 *
 * Checkbox border colour reflects priority (P1 red → P4 gray); filled
 * green when complete. Due chip is a styled wrapper around a native
 * `<input type="date">` for keyboard-accessible date picking; the
 * visible label shows the relative form ("Today", "Tomorrow",
 * "Overdue: May 18", weekday for the next week, "MMM d" otherwise).
 * Priority is changed via a small `<select>` — keyboard shortcuts
 * (1-4) on the selected row arrive in milestone 2.5.
 *
 * Note on title: still plain text in v1 — inline editing ships with
 * quick-add NLP in 2.4.
 */
export function TaskItem({ task }: TaskItemProps): JSX.Element {
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();

  const isComplete = task.completedAt !== null;

  const toggleComplete = (): void => {
    completeTask.mutate({ id: task.id, completed: !isComplete });
  };

  const onDelete = (e: React.MouseEvent): void => {
    e.stopPropagation();
    deleteTask.mutate(task.id);
  };

  const onDueDateChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    // Empty string means "clear" — patch to null. Otherwise pass the
    // YYYY-MM-DD value through (Zod accepts both date and datetime forms).
    const value = e.target.value;
    updateTask.mutate({
      id: task.id,
      patch: { dueDate: value === '' ? null : value },
    });
  };

  const onPriorityChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const priority = Number(e.target.value) as 1 | 2 | 3 | 4;
    updateTask.mutate({ id: task.id, patch: { priority } });
  };

  // Date input expects YYYY-MM-DD. If dueDate is a full datetime, slice
  // off the time portion for display in the input. Storage retains
  // whatever the user / NLP produced.
  const dueDateInputValue =
    task.dueDate === null ? '' : task.dueDate.slice(0, 10);

  return (
    <li className="group flex items-center gap-3 border-b border-gray-900 px-5 py-2.5 transition hover:bg-gray-900/40">
      <button
        onClick={toggleComplete}
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

      <span
        className={clsx(
          'min-w-0 flex-1 truncate text-sm',
          isComplete ? 'text-gray-500 line-through' : 'text-gray-200',
        )}
        title={task.title}
      >
        {task.title || <span className="italic text-gray-600">Untitled</span>}
      </span>

      <DueDateChip
        inputValue={dueDateInputValue}
        formattedLabel={formatDueDate(task.dueDate)}
        overdue={!isComplete && isOverdue(task.dueDate)}
        onChange={onDueDateChange}
        taskTitle={task.title}
      />

      <select
        value={task.priority}
        onChange={onPriorityChange}
        aria-label="Priority"
        title="Priority (1 = highest)"
        className="rounded-md border border-gray-800 bg-gray-900 px-1.5 py-0.5 text-xs text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        <option value={1}>P1</option>
        <option value={2}>P2</option>
        <option value={3}>P3</option>
        <option value={4}>P4</option>
      </select>

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

/**
 * Wrap a native date input so we can show the formatted relative-date
 * label on top while still getting browser-native keyboard / calendar
 * support. The input is positioned absolutely behind the label and
 * stretched to fill the chip, so clicking anywhere in the chip opens
 * the date picker.
 */
function DueDateChip({
  inputValue,
  formattedLabel,
  overdue,
  onChange,
  taskTitle,
}: {
  inputValue: string;
  formattedLabel: string;
  overdue: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  taskTitle: string;
}): JSX.Element {
  const hasDate = inputValue !== '';
  return (
    <label
      className={clsx(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-md border border-gray-800 px-2 py-0.5 text-xs transition hover:border-gray-600',
        overdue && 'border-red-700 text-red-400',
        !overdue && hasDate && 'text-gray-300',
        !hasDate && 'text-gray-600',
      )}
      title={`Due date for ${taskTitle || 'this task'}`}
    >
      <span aria-hidden className="select-none">
        {hasDate ? formattedLabel : '📅'}
      </span>
      <input
        type="date"
        value={inputValue}
        onChange={onChange}
        aria-label="Due date"
        // Native date input — visually invisible but full-area clickable
        // so the parent label captures all interactions.
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

/**
 * Map a priority value (1 highest, 4 lowest) to the unchecked checkbox
 * border colour. P4 (the default) is the same gray we use for plain
 * notes-list rows so unannotated tasks don't shout.
 */
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
