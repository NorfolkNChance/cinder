import { useState, useCallback, useMemo } from 'react';
import { useUI } from '../../state/ui';
import { useCreateTask, useProjectsList, useTasksList } from './queries';
import { TaskItem } from './TaskItem';
import { localDateString } from '../../lib/dates';
import type { TaskCreateInput } from '../../../../shared/schemas/tasks';

/**
 * Tasks main pane. Header shows the current scope's name; below it,
 * an inline new-task input and the task list itself.
 *
 * Scope sources its display name from:
 *   - 'inbox' → "Inbox"
 *   - 'project' → the matching project's name (looked up from the
 *      projects cache so we don't fan out an extra fetch per render)
 */
export function TaskList(): JSX.Element {
  const taskScope = useUI((s) => s.taskScope);
  const { data: tasks, isLoading } = useTasksList(taskScope);
  const { data: projects } = useProjectsList();
  const createTask = useCreateTask();

  const headerLabel = useMemo(() => {
    switch (taskScope.kind) {
      case 'inbox':
        return 'Inbox';
      case 'today':
        return 'Today';
      case 'upcoming':
        return 'Upcoming';
      case 'project': {
        const project = projects?.find((p) => p.id === taskScope.id);
        return project?.name ?? 'Project';
      }
    }
  }, [taskScope, projects]);

  // ── Inline new-task input ────────────────────────────────────────────────
  const [draftTitle, setDraftTitle] = useState('');

  const submitNewTask = useCallback(async () => {
    const title = draftTitle.trim();
    if (title.length === 0) return;

    // Scope-aware defaults for the new task. Today scope defaults the
    // due date to today so the task lands in the view that created it.
    // Upcoming has no obvious default day (which day in the next 7?),
    // so we leave the due date null — user picks it via the chip.
    const input: TaskCreateInput = {
      title,
      ...(taskScope.kind === 'project' ? { projectId: taskScope.id } : {}),
      ...(taskScope.kind === 'today' ? { dueDate: localDateString() } : {}),
    };
    await createTask.mutateAsync(input);
    setDraftTitle('');
  }, [draftTitle, createTask, taskScope]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-800 px-6 py-4">
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          {headerLabel}
        </h2>
      </header>

      <div className="border-b border-gray-800 px-5 py-3">
        <input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitNewTask();
          }}
          placeholder="Add a task and press Enter…"
          aria-label="New task title"
          className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="px-5 py-4 text-sm text-gray-500">Loading…</p>
        ) : !tasks || tasks.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">
            Nothing here yet. Add a task above.
          </p>
        ) : (
          <ul>
            {tasks.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
