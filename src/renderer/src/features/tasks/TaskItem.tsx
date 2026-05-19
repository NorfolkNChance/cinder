import clsx from 'clsx';
import type { Task } from '../../../../shared/schemas/tasks';
import { useCompleteTask, useDeleteTask } from './queries';

interface TaskItemProps {
  task: Task;
}

/**
 * A single task row. Checkbox toggles completion; ✕ soft-deletes.
 * Title is plain text — inline editing arrives in milestone 2.4 with
 * quick-add. Priority dot and due-date badge ship in 2.3.
 */
export function TaskItem({ task }: TaskItemProps): JSX.Element {
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();

  const isComplete = task.completedAt !== null;

  const toggleComplete = (): void => {
    completeTask.mutate({ id: task.id, completed: !isComplete });
  };

  const onDelete = (e: React.MouseEvent): void => {
    e.stopPropagation();
    deleteTask.mutate(task.id);
  };

  return (
    <li className="group flex items-center gap-3 border-b border-gray-900 px-5 py-2.5 transition hover:bg-gray-900/40">
      <button
        onClick={toggleComplete}
        role="checkbox"
        aria-checked={isComplete}
        aria-label={isComplete ? 'Mark as incomplete' : 'Mark as complete'}
        className={clsx(
          'inline-flex size-5 shrink-0 items-center justify-center rounded border focus:outline-none focus:ring-2 focus:ring-emerald-500',
          isComplete
            ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
            : 'border-gray-600 hover:border-gray-400',
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
