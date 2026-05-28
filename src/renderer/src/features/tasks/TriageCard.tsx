import { useState, useCallback } from 'react';
import clsx from 'clsx';
import { useUpdateTask, useDeleteTask, useProjectsList } from './queries';
import { useNote } from '../notes/queries';
import { formatDueDate } from '../../lib/dates';
import { useUI } from '../../state/ui';
import type { TaskWithLabels } from '../../../../shared/schemas/tasks';
import { DatePicker } from '../../components/DatePicker';

interface TriageCardProps {
  task: TaskWithLabels;
}

/**
 * Expanded card used in the Triage view.
 *
 * Each un-acknowledged task is displayed as a card with inline editing
 * for all the fields that matter for proper task setup: title, description,
 * priority, due date, and project. Clicking "Acknowledge" sets triage = 0
 * and the task immediately disappears from the Triage list into normal flow
 * (Inbox or its assigned project).
 */
export function TriageCard({ task }: TriageCardProps): JSX.Element {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { data: projects } = useProjectsList();

  // Local draft state — pre-filled from the task, edited before acknowledging.
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState<1 | 2 | 3 | 4>(
    task.priority as 1 | 2 | 3 | 4,
  );
  const [dueDate, setDueDate] = useState(task.dueDate?.slice(0, 10) ?? '');
  const [projectId, setProjectId] = useState<string>(task.projectId ?? '');

  const acknowledge = useCallback(() => {
    updateTask.mutate({
      id: task.id,
      patch: {
        title: title.trim() || task.title,
        description,
        priority,
        dueDate: dueDate === '' ? null : dueDate,
        projectId: projectId === '' ? null : projectId,
        triage: 0,
      },
    });
  }, [task.id, task.title, title, description, priority, dueDate, projectId, updateTask]);

  const onDelete = useCallback(() => {
    deleteTask.mutate(task.id);
  }, [task.id, deleteTask]);

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition dark:border-gray-700 dark:bg-gray-900">
      {/* Title */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') acknowledge();
        }}
        placeholder="Task title"
        aria-label="Task title"
        className="mb-3 w-full bg-transparent text-base font-semibold text-gray-900 placeholder-gray-400 focus:outline-none dark:text-white dark:placeholder-gray-600"
      />

      {/* Description */}
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Add a description or context… (optional)"
        aria-label="Task description"
        rows={2}
        className="mb-4 w-full resize-none rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:placeholder-gray-600"
      />

      {/* Setup controls row */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Priority */}
        <fieldset>
          <legend className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
            Priority
          </legend>
          <div className="flex gap-1" role="radiogroup" aria-label="Priority">
            {([1, 2, 3, 4] as const).map((p) => (
              <button
                key={p}
                role="radio"
                aria-checked={priority === p}
                onClick={() => setPriority(p)}
                className={clsx(
                  'rounded px-2 py-0.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-emerald-500',
                  priority === p
                    ? priorityActiveClass(p)
                    : 'border border-gray-300 text-gray-500 hover:border-gray-400 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500',
                )}
              >
                P{p}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Due date */}
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
            Due date
          </p>
          <DatePicker
            value={dueDate}
            onChange={setDueDate}
            label="Due date"
            placeholder="No date"
            formatValue={(v) => formatDueDate(v)}
            className="px-2 py-0.5"
          />
        </div>

        {/* Project */}
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
            Project
          </p>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="Project"
            className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
          >
            <option value="">No project (Inbox)</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <SourceNoteLink sourceNoteId={task.sourceNoteId} />
        <div className="flex items-center gap-2">
          <button
            onClick={onDelete}
            aria-label="Discard this task"
            className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 dark:hover:bg-gray-800"
          >
            Discard
          </button>
          <button
            onClick={acknowledge}
            disabled={updateTask.isPending}
            className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          >
            Acknowledge →
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * Shows a clickable link back to the source note when the task was created
 * via the NoteEditor "+ Todo" button.
 *
 * Rendered as a separate component so `useNote` is only called (and the
 * IPC query is only fired) when there is actually a sourceNoteId — React
 * mounts/unmounts this based on the conditional in TriageCard.
 */
function SourceNoteLink({
  sourceNoteId,
}: {
  sourceNoteId: string | null;
}): JSX.Element {
  const { data: note } = useNote(sourceNoteId);
  const setMode = useUI((s) => s.setMode);
  const setSelectedNoteId = useUI((s) => s.setSelectedNoteId);

  if (sourceNoteId === null || note === null || note === undefined) {
    return (
      <p className="text-[11px] text-gray-400 dark:text-gray-600">
        Set it up, then acknowledge to move it into your workflow.
      </p>
    );
  }

  return (
    <button
      onClick={() => {
        setMode('notes');
        setSelectedNoteId(sourceNoteId);
      }}
      className="flex items-center gap-1 text-[11px] text-indigo-500 hover:text-indigo-600 hover:underline focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded dark:text-indigo-400 dark:hover:text-indigo-300"
      title="Open source note"
    >
      <span aria-hidden="true">↗</span>
      {note.title !== '' ? note.title : 'Untitled note'}
    </button>
  );
}

function priorityActiveClass(p: 1 | 2 | 3 | 4): string {
  switch (p) {
    case 1:
      return 'bg-red-500 text-white';
    case 2:
      return 'bg-orange-500 text-white';
    case 3:
      return 'bg-blue-500 text-white';
    case 4:
      return 'bg-gray-400 text-white dark:bg-gray-600';
  }
}
