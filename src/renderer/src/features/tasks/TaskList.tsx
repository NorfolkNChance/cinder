import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useUI } from '../../state/ui';
import {
  useCreateTask,
  useLabelsList,
  useProjectsList,
  useSavedFiltersList,
  useTasksList,
} from './queries';
import { TaskItem } from './TaskItem';
import { formatDueDate, localDateString } from '../../lib/dates';
import { parseQuickAdd, type ParsedQuickAdd } from './quickAdd';
import { describeRecurrence } from '../../../../shared/recurrence';
import { useTaskShortcuts } from './useTaskShortcuts';
import type { TaskCreateInput } from '../../../../shared/schemas/tasks';

/**
 * Tasks main pane. Header shows the current scope's name; below it,
 * the quick-add input and the task list itself.
 *
 * The new-task input uses the quickAdd NLP parser:
 *   "Submit report tomorrow at 5pm p1 #work"  →  task {
 *     title: 'Submit report',
 *     dueDate: <tomorrow 17:00 ISO>,
 *     priority: 1,
 *     projectId: <Work project id>,
 *   }
 *
 * The parser runs live as the user types, and a small preview line
 * shows what will be created on Enter — so the user has feedback that
 * their tokens were recognised.
 */
export function TaskList(): JSX.Element {
  const taskScope = useUI((s) => s.taskScope);
  const { data: tasks, isLoading } = useTasksList(taskScope);
  const { data: projects } = useProjectsList();
  const { data: labels } = useLabelsList();
  const { data: savedFilters } = useSavedFiltersList();
  const createTask = useCreateTask();

  const header = useMemo<{ title: string; subtitle?: string }>(() => {
    switch (taskScope.kind) {
      case 'inbox':
        return { title: 'Inbox' };
      case 'today':
        return { title: 'Today' };
      case 'upcoming':
        return { title: 'Upcoming' };
      case 'project': {
        const project = projects?.find((p) => p.id === taskScope.id);
        return { title: project?.name ?? 'Project' };
      }
      case 'label': {
        const label = labels?.find((l) => l.id === taskScope.id);
        return { title: label !== undefined ? `@${label.name}` : 'Label' };
      }
      case 'filter': {
        const f = savedFilters?.find((x) => x.id === taskScope.id);
        return {
          title: f?.name ?? 'Filter',
          subtitle: f?.expression,
        };
      }
    }
  }, [taskScope, projects, labels, savedFilters]);

  // ── Quick-add input + keyboard shortcuts ────────────────────────────────
  const [draft, setDraft] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const quickAddRef = useRef<HTMLInputElement>(null);

  // Reset selection when the scope changes — the previously selected
  // task is almost certainly not in the new view.
  useEffect(() => {
    setSelectedTaskId(null);
    setEditingTaskId(null);
  }, [taskScope]);

  // Drop selection/editing if the selected task disappears from the visible
  // list (completed, deleted, moved to another scope, etc).
  useEffect(() => {
    if (selectedTaskId === null) return;
    if (!tasks?.some((t) => t.id === selectedTaskId)) {
      setSelectedTaskId(null);
      setEditingTaskId(null);
    }
  }, [tasks, selectedTaskId]);

  useTaskShortcuts({
    tasks: tasks ?? [],
    selectedTaskId,
    setSelectedTaskId,
    focusQuickAdd: () => quickAddRef.current?.focus(),
    startEditing: () => {
      if (selectedTaskId !== null) setEditingTaskId(selectedTaskId);
    },
  });

  // Live parse on every keystroke. Cheap — the parser is pure JS on a
  // short string — but memoise on the draft+projects identity so we
  // don't re-allocate the result during unrelated re-renders.
  const parsed: ParsedQuickAdd = useMemo(
    () =>
      parseQuickAdd(draft, {
        projects: projects ?? [],
        labels: labels ?? [],
      }),
    [draft, projects, labels],
  );

  const submitNewTask = useCallback(async () => {
    if (draft.trim().length === 0) return;
    const input = buildCreateInput(parsed, taskScope);
    // Empty title after stripping is allowed (schema permits it; UI
    // shows "Untitled"). But if there's literally NOTHING — no title,
    // no date, no priority, no project — bail to avoid an entirely
    // empty task.
    if (
      input.title === '' &&
      input.dueDate === undefined &&
      input.priority === undefined &&
      input.projectId === undefined &&
      (input.labelIds === undefined || input.labelIds.length === 0)
    ) {
      return;
    }
    await createTask.mutateAsync(input);
    setDraft('');
  }, [draft, parsed, createTask, taskScope]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
          {header.title}
        </h2>
        {header.subtitle !== undefined && (
          <p className="mt-0.5 font-mono text-xs text-gray-500">
            {header.subtitle}
          </p>
        )}
      </header>

      <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800">
        <input
          ref={quickAddRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitNewTask();
            else if (e.key === 'Escape') {
              setDraft('');
              quickAddRef.current?.blur();
            }
          }}
          placeholder="Press q to focus — try “tomorrow at 5pm p1 #work”…"
          aria-label="New task quick-add"
          className="w-full rounded-md bg-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-900 dark:text-gray-200 dark:placeholder-gray-500"
        />
        {draft.length > 0 && (
          <QuickAddPreview parsed={parsed} projects={projects ?? []} />
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="px-5 py-4 text-sm text-gray-500">Loading…</p>
        ) : !tasks || tasks.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">
            Nothing here yet. Add a task above.
          </p>
        ) : (
          <ul role="list" aria-label="Tasks">
            {tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                isSelected={task.id === selectedTaskId}
                onSelect={setSelectedTaskId}
                isEditing={task.id === editingTaskId}
                onEditingChange={(editing) =>
                  setEditingTaskId(editing ? task.id : null)
                }
              />
            ))}
          </ul>
        )}
      </div>

      <ShortcutHint />
    </div>
  );
}

/**
 * Persistent small footer documenting the keyboard shortcuts. Mostly
 * for discoverability — there's no separate help overlay yet.
 */
function ShortcutHint(): JSX.Element {
  return (
    <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-200 px-5 py-2 text-[11px] text-gray-500 dark:border-gray-800 dark:text-gray-600">
      <Hint label="q">quick-add</Hint>
      <Hint label="↑↓">navigate</Hint>
      <Hint label="e">edit</Hint>
      <Hint label="1-4">priority</Hint>
      <Hint label="space">complete</Hint>
      <Hint label="del">delete</Hint>
      <Hint label="esc">deselect</Hint>
    </footer>
  );
}

function Hint({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="rounded border border-gray-300 bg-gray-100 px-1 font-mono text-[10px] text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        {label}
      </kbd>
      <span>{children}</span>
    </span>
  );
}

/**
 * Compose the TaskCreateInput from the NLP parse and the current scope.
 *
 * Precedence: parser-extracted values beat scope defaults, since the
 * user explicitly typed them. Scope defaults only kick in when the
 * parser found nothing:
 *   - scope=project + parser had no #tag → put the task in the scope project
 *   - scope=today + parser had no date → default dueDate to today
 *
 * Returned object uses conditional spread so `exactOptionalPropertyTypes`
 * is happy — undefined-keyed properties are forbidden.
 */
function buildCreateInput(
  parsed: ParsedQuickAdd,
  scope: ReturnType<typeof useUI.getState>['taskScope'],
): TaskCreateInput {
  const projectId =
    parsed.projectId !== null
      ? parsed.projectId
      : scope.kind === 'project'
        ? scope.id
        : null;

  const dueDate =
    parsed.dueDate !== null
      ? parsed.dueDate
      : scope.kind === 'today'
        ? localDateString()
        : null;

  return {
    title: parsed.title,
    ...(projectId !== null ? { projectId } : {}),
    ...(dueDate !== null ? { dueDate } : {}),
    ...(parsed.priority !== null ? { priority: parsed.priority } : {}),
    ...(parsed.recurrence !== null
      ? { dueRecurrence: parsed.recurrence }
      : {}),
    ...(parsed.labelIds.length > 0 ? { labelIds: [...parsed.labelIds] } : {}),
  };
}

// ── Preview row ─────────────────────────────────────────────────────────────

function QuickAddPreview({
  parsed,
  projects,
}: {
  parsed: ParsedQuickAdd;
  projects: readonly { id: string; name: string }[];
}): JSX.Element {
  // Labels need their own lookup — they come from a different cache than
  // projects. Keeping it inline avoids prop-drilling another array.
  const { data: labels } = useLabelsList();
  const projectName = projects.find((p) => p.id === parsed.projectId)?.name;
  const matchedLabels =
    labels?.filter((l) => parsed.labelIds.includes(l.id)) ?? [];
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-gray-500">
      <span className="text-gray-600 dark:text-gray-400">
        ↳ {parsed.title || <em className="text-gray-500 dark:text-gray-600">empty title</em>}
      </span>
      {parsed.dueDate !== null && (
        <Chip color="emerald">{formatDueDate(parsed.dueDate)}</Chip>
      )}
      {parsed.priority !== null && (
        <Chip color={priorityColor(parsed.priority)}>P{parsed.priority}</Chip>
      )}
      {projectName !== undefined && <Chip color="indigo">#{projectName}</Chip>}
      {matchedLabels.map((l) => (
        <Chip key={l.id} color="teal">
          @{l.name}
        </Chip>
      ))}
      {parsed.recurrence !== null && (
        <Chip color="purple">↻ {describeRecurrence(parsed.recurrence)}</Chip>
      )}
    </div>
  );
}

function Chip({
  color,
  children,
}: {
  color:
    | 'emerald'
    | 'red'
    | 'orange'
    | 'blue'
    | 'gray'
    | 'indigo'
    | 'purple'
    | 'teal';
  children: React.ReactNode;
}): JSX.Element {
  const palette: Record<typeof color, string> = {
    emerald: 'border-emerald-700 text-emerald-300',
    red: 'border-red-700 text-red-300',
    orange: 'border-orange-700 text-orange-300',
    blue: 'border-blue-700 text-blue-300',
    gray: 'border-gray-700 text-gray-300',
    indigo: 'border-indigo-700 text-indigo-300',
    purple: 'border-purple-700 text-purple-300',
    teal: 'border-teal-700 text-teal-300',
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 ${palette[color]}`}
    >
      {children}
    </span>
  );
}

function priorityColor(
  p: 1 | 2 | 3 | 4,
): 'red' | 'orange' | 'blue' | 'gray' {
  switch (p) {
    case 1:
      return 'red';
    case 2:
      return 'orange';
    case 3:
      return 'blue';
    case 4:
      return 'gray';
  }
}
