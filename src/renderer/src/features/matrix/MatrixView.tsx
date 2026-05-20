import { useMemo } from 'react';
import { useUI } from '../../state/ui';
import { useAllTasksList } from '../tasks/queries';
import { classifyAll, type Quadrant } from '../../../../shared/matrix/classify';
import { formatDueDate } from '../../lib/dates';
import type { TaskWithLabels } from '../../../../shared/schemas/tasks';

/**
 * Eisenhower matrix — 2×2 CSS grid view.
 *
 * Data flow:
 *   useAllTasksList → all active tasks
 *   ↓  filter by matrixProjectId / matrixLabelId (UI state)
 *   ↓  classifyAll(tasks, matrixPrefs) → { do, schedule, delegate, eliminate }
 *   ↓  render QuadrantPanel for each bucket
 *
 * Drag-and-drop mutations are wired in milestone 4.2.
 * Task detail side panel is wired in milestone 4.3.
 */
export function MatrixView(): JSX.Element {
  const matrixPrefs = useUI((s) => s.matrixPrefs);
  const matrixProjectId = useUI((s) => s.matrixProjectId);
  const matrixLabelId = useUI((s) => s.matrixLabelId);

  const { data: allTasks, isLoading } = useAllTasksList();

  // Apply project + label filters before classification.
  const filteredTasks = useMemo(() => {
    if (!allTasks) return [];
    return allTasks.filter((t) => {
      if (matrixProjectId !== null && t.projectId !== matrixProjectId)
        return false;
      if (
        matrixLabelId !== null &&
        !t.labels.some((l) => l.id === matrixLabelId)
      )
        return false;
      return true;
    });
  }, [allTasks, matrixProjectId, matrixLabelId]);

  const quadrants = useMemo(
    () => classifyAll(filteredTasks, matrixPrefs),
    [filteredTasks, matrixPrefs],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Column headers */}
      <div className="grid grid-cols-2 border-b border-gray-800">
        <div className="border-r border-gray-800 px-4 py-2 text-center text-xs font-semibold uppercase tracking-widest text-gray-500">
          Urgent
        </div>
        <div className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-widest text-gray-500">
          Not Urgent
        </div>
      </div>

      {/* 2×2 grid */}
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2">
        {/* Q1: Do — top-left */}
        <QuadrantPanel
          quadrant="do"
          label="Do"
          accent="red"
          importance="Important"
          tasks={quadrants.do}
          position="top-left"
        />
        {/* Q2: Schedule — top-right */}
        <QuadrantPanel
          quadrant="schedule"
          label="Schedule"
          accent="blue"
          importance="Important"
          tasks={quadrants.schedule}
          position="top-right"
        />
        {/* Q3: Delegate — bottom-left */}
        <QuadrantPanel
          quadrant="delegate"
          label="Delegate"
          accent="orange"
          importance="Not Important"
          tasks={quadrants.delegate}
          position="bottom-left"
        />
        {/* Q4: Eliminate — bottom-right */}
        <QuadrantPanel
          quadrant="eliminate"
          label="Eliminate"
          accent="gray"
          importance="Not Important"
          tasks={quadrants.eliminate}
          position="bottom-right"
        />
      </div>
    </div>
  );
}

// ── Quadrant panel ───────────────────────────────────────────────────────────

type Accent = 'red' | 'blue' | 'orange' | 'gray';
type Position = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const ACCENT_STYLES: Record<
  Accent,
  { header: string; badge: string; card: string; count: string }
> = {
  red: {
    header: 'text-red-400',
    badge: 'bg-red-900/40 text-red-300 border-red-800',
    card: 'hover:border-red-700/50',
    count: 'text-red-500',
  },
  blue: {
    header: 'text-blue-400',
    badge: 'bg-blue-900/40 text-blue-300 border-blue-800',
    card: 'hover:border-blue-700/50',
    count: 'text-blue-500',
  },
  orange: {
    header: 'text-orange-400',
    badge: 'bg-orange-900/40 text-orange-300 border-orange-800',
    card: 'hover:border-orange-700/50',
    count: 'text-orange-500',
  },
  gray: {
    header: 'text-gray-400',
    badge: 'bg-gray-800 text-gray-400 border-gray-700',
    card: 'hover:border-gray-600',
    count: 'text-gray-600',
  },
};

const BORDER_CLASSES: Record<Position, string> = {
  'top-left': 'border-r border-b border-gray-800',
  'top-right': 'border-b border-gray-800',
  'bottom-left': 'border-r border-gray-800',
  'bottom-right': '',
};

function QuadrantPanel({
  quadrant: _quadrant,
  label,
  accent,
  importance,
  tasks,
  position,
}: {
  quadrant: Quadrant;
  label: string;
  accent: Accent;
  importance: string;
  tasks: readonly TaskWithLabels[];
  position: Position;
}): JSX.Element {
  const styles = ACCENT_STYLES[accent];

  return (
    <div
      className={`flex flex-col overflow-hidden ${BORDER_CLASSES[position]}`}
    >
      {/* Panel header */}
      <div className="flex items-baseline gap-2 border-b border-gray-800/60 px-4 py-2.5">
        <span className={`text-sm font-semibold ${styles.header}`}>
          {label}
        </span>
        <span className="text-[10px] text-gray-600">{importance}</span>
        <span className={`ml-auto text-xs font-mono ${styles.count}`}>
          {tasks.length}
        </span>
      </div>

      {/* Task cards */}
      <div className="flex-1 overflow-y-auto p-2.5">
        {tasks.length === 0 ? (
          <p className="mt-4 text-center text-xs text-gray-700">Empty</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tasks.map((task) => (
              <MatrixTaskCard key={task.id} task={task} styles={styles} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Task card ────────────────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<number, string> = {
  1: 'P1',
  2: 'P2',
  3: 'P3',
  4: 'P4',
};
const PRIORITY_COLOR: Record<number, string> = {
  1: 'text-red-400',
  2: 'text-orange-400',
  3: 'text-blue-400',
  4: 'text-gray-600',
};

function MatrixTaskCard({
  task,
  styles,
}: {
  task: TaskWithLabels;
  styles: { badge: string; card: string };
}): JSX.Element {
  const due = formatDueDate(task.dueDate);

  return (
    <li
      className={`cursor-default rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 transition-colors ${styles.card}`}
      title={task.title || '(untitled)'}
    >
      {/* Title */}
      <p className="truncate text-sm leading-snug text-gray-200">
        {task.title || <em className="text-gray-600">Untitled</em>}
      </p>

      {/* Meta row */}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {task.priority !== 4 && (
          <span
            className={`text-[10px] font-mono font-semibold ${PRIORITY_COLOR[task.priority] ?? 'text-gray-600'}`}
          >
            {PRIORITY_LABEL[task.priority] ?? ''}
          </span>
        )}
        {due.length > 0 && (
          <span className={`rounded border px-1 py-0.5 text-[10px] ${styles.badge}`}>
            {due}
          </span>
        )}
        {task.labels.map((l) => (
          <span
            key={l.id}
            className="rounded border border-teal-800 px-1 py-0.5 text-[10px] text-teal-400"
          >
            @{l.name}
          </span>
        ))}
      </div>
    </li>
  );
}
