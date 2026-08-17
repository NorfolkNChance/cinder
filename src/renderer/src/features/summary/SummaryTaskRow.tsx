import clsx from 'clsx';
import { useCompleteTask, useUpdateTask } from '../tasks/queries';
import { useUI } from '../../state/ui';
import { addDays, formatDueDate, localDateString } from '../../lib/dates';
import type { TaskWithLabels } from '../../../../shared/schemas/tasks';

interface SummaryTaskRowProps {
  task: TaskWithLabels;
  /** Hide the due label when every row in the card shares the same day. */
  showDue?: boolean;
  /** Render completed styling (strike-through, no actions). */
  done?: boolean;
}

/**
 * Compact task row used by every Summary card.
 *
 * Quick actions live inline: the checkbox completes, "Tomorrow →" snoozes
 * (due date := tomorrow), and clicking the title jumps to the task's home
 * in Tasks mode (its project, or Inbox). Mutations invalidate the
 * `tasks.all` prefix, so every Summary card refreshes automatically.
 */
export function SummaryTaskRow({
  task,
  showDue = true,
  done = false,
}: SummaryTaskRowProps): JSX.Element {
  const completeTask = useCompleteTask();
  const updateTask = useUpdateTask();
  const setMode = useUI((s) => s.setMode);
  const setTaskScope = useUI((s) => s.setTaskScope);

  const goToTask = (): void => {
    setTaskScope(
      task.projectId !== null
        ? { kind: 'project', id: task.projectId }
        : { kind: 'inbox' },
    );
    setMode('tasks');
  };

  return (
    <li className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/60">
      {done ? (
        <span
          aria-hidden="true"
          className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white"
        >
          ✓
        </span>
      ) : (
        <button
          onClick={() => completeTask.mutate({ id: task.id, completed: true })}
          disabled={completeTask.isPending}
          aria-label={`Complete "${task.title}"`}
          title="Complete"
          className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-gray-300 transition hover:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-600 dark:hover:border-emerald-400"
        />
      )}

      <span
        aria-hidden="true"
        title={`Priority ${task.priority}`}
        className={clsx(
          'h-1.5 w-1.5 flex-shrink-0 rounded-full',
          priorityDotClass(task.priority),
        )}
      />

      <button
        onClick={goToTask}
        title="Open in Tasks"
        className={clsx(
          'min-w-0 flex-1 truncate text-left text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded',
          done
            ? 'text-gray-400 line-through dark:text-gray-600'
            : 'text-gray-800 dark:text-gray-200',
        )}
      >
        {task.title !== '' ? task.title : 'Untitled task'}
      </button>

      {showDue && task.dueDate !== null && (
        <span className="flex-shrink-0 text-[11px] text-gray-500 dark:text-gray-500">
          {formatDueDate(task.dueDate)}
        </span>
      )}

      {!done && (
        <button
          onClick={() =>
            updateTask.mutate({
              id: task.id,
              patch: { dueDate: localDateString(addDays(new Date(), 1)) },
            })
          }
          disabled={updateTask.isPending}
          aria-label={`Snooze "${task.title}" to tomorrow`}
          className="flex-shrink-0 rounded px-1.5 py-0.5 text-[11px] text-gray-400 opacity-0 transition hover:bg-gray-200 hover:text-gray-700 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 group-hover:opacity-100 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          Tomorrow →
        </button>
      )}
    </li>
  );
}

function priorityDotClass(priority: number): string {
  switch (priority) {
    case 1:
      return 'bg-red-500';
    case 2:
      return 'bg-orange-500';
    case 3:
      return 'bg-blue-500';
    default:
      return 'bg-gray-300 dark:bg-gray-600';
  }
}
