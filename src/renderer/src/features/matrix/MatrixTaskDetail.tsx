import { useState, useEffect } from 'react';
import {
  useUpdateTask,
  useCompleteTask,
  useDeleteTask,
  useProjectsList,
} from '../tasks/queries';
import { formatDueDate } from '../../lib/dates';
import type { TaskWithLabels } from '../../../../shared/schemas/tasks';
import { describeRecurrence } from '../../../../shared/recurrence';
import { DatePicker } from '../../components/DatePicker';

/**
 * Task detail side panel for the Eisenhower matrix view.
 *
 * Slides in from the right when a task card is clicked. Provides inline
 * editing for all primary fields without leaving the matrix.
 *
 * Mutations use the same hooks as TaskItem so the matrix and task list
 * stay in sync through the shared TanStack Query cache.
 */
export function MatrixTaskDetail({
  task,
  onClose,
}: {
  task: TaskWithLabels;
  onClose: () => void;
}): JSX.Element {
  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();
  const { data: projects } = useProjectsList();

  // Local draft for title — committed on blur or Enter.
  const [titleDraft, setTitleDraft] = useState(task.title);

  // Sync draft if a different task is selected.
  useEffect(() => {
    setTitleDraft(task.title);
  }, [task.id, task.title]);

  const commitTitle = (): void => {
    const trimmed = titleDraft.trim();
    if (trimmed !== task.title) {
      updateTask.mutate({ id: task.id, patch: { title: trimmed } });
    }
  };

  const onPriorityChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    updateTask.mutate({
      id: task.id,
      patch: { priority: Number(e.target.value) as 1 | 2 | 3 | 4 },
    });
  };

  const onDueDateChange = (value: string): void => {
    updateTask.mutate({
      id: task.id,
      patch: { dueDate: value === '' ? null : value },
    });
  };

  const onProjectChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const value = e.target.value;
    updateTask.mutate({
      id: task.id,
      patch: { projectId: value === '' ? null : value },
    });
  };

  const toggleComplete = (): void => {
    completeTask.mutate({
      id: task.id,
      completed: task.completedAt === null,
    });
  };

  const handleDelete = (): void => {
    deleteTask.mutate(task.id);
    onClose();
  };

  const isComplete = task.completedAt !== null;
  const dueDateInputValue = task.dueDate === null ? '' : task.dueDate.slice(0, 10);
  const projectName = projects?.find((p) => p.id === task.projectId)?.name;

  return (
    // Slide-in overlay panel
    <div
      className="absolute bottom-0 right-0 top-0 z-10 flex w-72 flex-col border-l border-gray-300 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-950"
      role="complementary"
      aria-label="Task detail"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Task detail
        </span>
        <button
          onClick={onClose}
          aria-label="Close detail panel"
          className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          ✕
        </button>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Title */}
        <div className="mb-4">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-gray-500 dark:text-gray-600">
            Title
          </label>
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            placeholder="Task title"
            className="w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          />
        </div>

        {/* Priority */}
        <div className="mb-4">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-gray-500 dark:text-gray-600">
            Priority
          </label>
          <select
            value={task.priority}
            onChange={onPriorityChange}
            className="w-full rounded-md border border-gray-300 bg-gray-100 px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value={1}>P1 — Critical</option>
            <option value={2}>P2 — High</option>
            <option value={3}>P3 — Medium</option>
            <option value={4}>P4 — Low</option>
          </select>
        </div>

        {/* Due date */}
        <div className="mb-4">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-gray-500 dark:text-gray-600">
            Due date
          </label>
          <DatePicker
            value={dueDateInputValue}
            onChange={onDueDateChange}
            label="Due date"
            placeholder="No date"
            formatValue={(v) => formatDueDate(v)}
            className="w-full px-3 py-1.5 text-sm"
          />
        </div>

        {/* Project */}
        <div className="mb-4">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-gray-500 dark:text-gray-600">
            Project
          </label>
          <select
            value={task.projectId ?? ''}
            onChange={onProjectChange}
            className="w-full rounded-md border border-gray-300 bg-gray-100 px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value="">No project (Inbox)</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Labels (read-only) */}
        {task.labels.length > 0 && (
          <div className="mb-4">
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-widest text-gray-500 dark:text-gray-600">
              Labels
            </label>
            <div className="flex flex-wrap gap-1.5">
              {task.labels.map((l) => (
                <span
                  key={l.id}
                  className="rounded border border-teal-800 px-2 py-0.5 text-xs text-teal-300"
                >
                  @{l.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recurrence (read-only) */}
        {task.dueRecurrence !== null && (
          <div className="mb-4">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-gray-500 dark:text-gray-600">
              Repeats
            </label>
            <p className="text-xs text-purple-400">
              ↻ {describeRecurrence(task.dueRecurrence)}
            </p>
          </div>
        )}

        {/* Current quadrant — informational */}
        {projectName !== undefined && (
          <div className="mb-4">
            <p className="text-[11px] text-gray-700">
              In project{' '}
              <span className="text-gray-500">#{projectName}</span>
            </p>
          </div>
        )}

        {/* Created timestamp */}
        <p className="text-[11px] text-gray-700">
          Created {new Date(task.createdAt).toLocaleDateString()}
        </p>
      </div>

      {/* Footer actions */}
      <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleComplete}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
              isComplete
                ? 'border border-gray-300 bg-gray-100 text-gray-600 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                : 'bg-emerald-700 text-white hover:bg-emerald-600'
            }`}
          >
            {isComplete ? 'Reopen' : 'Complete'}
          </button>
          <button
            onClick={handleDelete}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:border-red-700 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:border-gray-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
