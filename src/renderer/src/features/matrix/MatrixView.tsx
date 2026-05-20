import { useMemo, useState, useCallback } from 'react';
import { useUI } from '../../state/ui';
import { useAllTasksList, useUpdateTask } from '../tasks/queries';
import {
  classifyAll,
  classifyTask,
  type Quadrant,
  type MatrixPrefs,
} from '../../../../shared/matrix/classify';
import { formatDueDate, localDateString } from '../../lib/dates';
import type { TaskWithLabels } from '../../../../shared/schemas/tasks';
import type { TaskUpdateInput } from '../../../../shared/schemas/tasks';

/**
 * Eisenhower matrix — 2×2 CSS grid view.
 *
 * Data flow:
 *   useAllTasksList → all active tasks
 *   ↓  filter by matrixProjectId / matrixLabelId (UI state)
 *   ↓  classifyAll(tasks, matrixPrefs) → { do, schedule, delegate, eliminate }
 *   ↓  render QuadrantPanel for each bucket
 *
 * ## Drag-and-drop (milestone 4.2)
 *
 * HTML5 DnD: each card sets `dataTransfer` with the task id on dragStart.
 * QuadrantPanel accepts drops and calls buildPatch() to compute the minimum
 * priority/dueDate mutation that lands the task in the target quadrant.
 *
 * "Large" moves (crossing both axes simultaneously, e.g. Q4→Q1) prompt a
 * small inline confirmation before the mutation fires. This prevents
 * accidental sweeping changes and gives the user a moment to reconsider.
 */

// ── Patch builder ─────────────────────────────────────────────────────────────

/**
 * Compute the minimal patch to place `task` in `targetQuadrant`.
 *
 * Priority change: clamp into the important/not-important band rather than
 * hard-coding P1/P3. This respects custom importanceCutoff settings.
 *
 * dueDate change:
 *   → urgent:      set to today (if task wasn't already urgent)
 *   → not urgent:  clear to null (if task was urgent)
 */
function buildPatch(
  task: TaskWithLabels,
  targetQuadrant: Quadrant,
  prefs: MatrixPrefs,
): TaskUpdateInput['patch'] {
  const targetUrgent = targetQuadrant === 'do' || targetQuadrant === 'delegate';
  const targetImportant =
    targetQuadrant === 'do' || targetQuadrant === 'schedule';

  const currentUrgent =
    classifyTask(task, prefs) === 'do' ||
    classifyTask(task, prefs) === 'delegate';
  const currentImportant =
    classifyTask(task, prefs) === 'do' ||
    classifyTask(task, prefs) === 'schedule';

  const patch: TaskUpdateInput['patch'] = {};

  if (targetUrgent !== currentUrgent) {
    if (targetUrgent) {
      patch.dueDate = localDateString(); // today
    } else {
      patch.dueDate = null; // clear
    }
  }

  if (targetImportant !== currentImportant) {
    if (targetImportant) {
      // Clamp to the top of the "important" band.
      patch.priority = prefs.importanceCutoff as 1 | 2 | 3 | 4;
    } else {
      // Just below the cutoff, capped at P4.
      patch.priority = Math.min(
        prefs.importanceCutoff + 1,
        4,
      ) as 1 | 2 | 3 | 4;
    }
  }

  return patch;
}

/**
 * A move is "large" (both axes cross simultaneously) when the source and
 * target quadrants are diagonal opposites: do↔eliminate or schedule↔delegate.
 */
function isLargeMove(from: Quadrant, to: Quadrant): boolean {
  return (
    (from === 'do' && to === 'eliminate') ||
    (from === 'eliminate' && to === 'do') ||
    (from === 'schedule' && to === 'delegate') ||
    (from === 'delegate' && to === 'schedule')
  );
}

// ── Pending confirmation state ────────────────────────────────────────────────

interface PendingDrop {
  task: TaskWithLabels;
  fromQuadrant: Quadrant;
  toQuadrant: Quadrant;
  patch: TaskUpdateInput['patch'];
}

// ── Main component ────────────────────────────────────────────────────────────

export function MatrixView(): JSX.Element {
  const matrixPrefs = useUI((s) => s.matrixPrefs);
  const matrixProjectId = useUI((s) => s.matrixProjectId);
  const matrixLabelId = useUI((s) => s.matrixLabelId);

  const { data: allTasks, isLoading } = useAllTasksList();
  const updateTask = useUpdateTask();

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoveredQuadrant, setHoveredQuadrant] = useState<Quadrant | null>(null);

  // Confirmation state (large moves)
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);

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

  // Resolve a task by id from the unfiltered list (so drops work even if
  // the task isn't in the current project/label filter).
  const taskById = useCallback(
    (id: string): TaskWithLabels | undefined =>
      allTasks?.find((t) => t.id === id),
    [allTasks],
  );

  // DnD handlers passed down to QuadrantPanel
  const handleDragStart = useCallback((taskId: string) => {
    setDraggingId(taskId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setHoveredQuadrant(null);
  }, []);

  const handleDrop = useCallback(
    (targetQuadrant: Quadrant) => {
      setHoveredQuadrant(null);
      if (draggingId === null) return;
      const task = taskById(draggingId);
      if (!task) return;

      const fromQuadrant = classifyTask(task, matrixPrefs);
      if (fromQuadrant === targetQuadrant) return; // no-op

      const patch = buildPatch(task, targetQuadrant, matrixPrefs);
      if (Object.keys(patch).length === 0) return; // nothing changes

      if (isLargeMove(fromQuadrant, targetQuadrant)) {
        // Show confirmation before committing
        setPendingDrop({ task, fromQuadrant, toQuadrant: targetQuadrant, patch });
      } else {
        void updateTask.mutateAsync({ id: task.id, patch });
      }
    },
    [draggingId, taskById, matrixPrefs, updateTask],
  );

  const confirmDrop = useCallback(() => {
    if (!pendingDrop) return;
    void updateTask.mutateAsync({
      id: pendingDrop.task.id,
      patch: pendingDrop.patch,
    });
    setPendingDrop(null);
  }, [pendingDrop, updateTask]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
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
        <QuadrantPanel
          quadrant="do"
          label="Do"
          accent="red"
          importance="Important"
          tasks={quadrants.do}
          position="top-left"
          isDragOver={hoveredQuadrant === 'do'}
          onDrop={handleDrop}
          onDragOverChange={setHoveredQuadrant}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          draggingId={draggingId}
        />
        <QuadrantPanel
          quadrant="schedule"
          label="Schedule"
          accent="blue"
          importance="Important"
          tasks={quadrants.schedule}
          position="top-right"
          isDragOver={hoveredQuadrant === 'schedule'}
          onDrop={handleDrop}
          onDragOverChange={setHoveredQuadrant}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          draggingId={draggingId}
        />
        <QuadrantPanel
          quadrant="delegate"
          label="Delegate"
          accent="orange"
          importance="Not Important"
          tasks={quadrants.delegate}
          position="bottom-left"
          isDragOver={hoveredQuadrant === 'delegate'}
          onDrop={handleDrop}
          onDragOverChange={setHoveredQuadrant}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          draggingId={draggingId}
        />
        <QuadrantPanel
          quadrant="eliminate"
          label="Eliminate"
          accent="gray"
          importance="Not Important"
          tasks={quadrants.eliminate}
          position="bottom-right"
          isDragOver={hoveredQuadrant === 'eliminate'}
          onDrop={handleDrop}
          onDragOverChange={setHoveredQuadrant}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          draggingId={draggingId}
        />
      </div>

      {/* Large-move confirmation overlay */}
      {pendingDrop !== null && (
        <ConfirmMoveModal
          from={pendingDrop.fromQuadrant}
          to={pendingDrop.toQuadrant}
          taskTitle={pendingDrop.task.title}
          onConfirm={confirmDrop}
          onCancel={() => setPendingDrop(null)}
        />
      )}
    </div>
  );
}

// ── Quadrant panel ────────────────────────────────────────────────────────────

type Accent = 'red' | 'blue' | 'orange' | 'gray';
type Position = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const ACCENT_STYLES: Record<
  Accent,
  { header: string; badge: string; card: string; count: string; dropRing: string }
> = {
  red: {
    header: 'text-red-400',
    badge: 'bg-red-900/40 text-red-300 border-red-800',
    card: 'hover:border-red-700/50',
    count: 'text-red-500',
    dropRing: 'ring-2 ring-inset ring-red-600/60 bg-red-950/20',
  },
  blue: {
    header: 'text-blue-400',
    badge: 'bg-blue-900/40 text-blue-300 border-blue-800',
    card: 'hover:border-blue-700/50',
    count: 'text-blue-500',
    dropRing: 'ring-2 ring-inset ring-blue-600/60 bg-blue-950/20',
  },
  orange: {
    header: 'text-orange-400',
    badge: 'bg-orange-900/40 text-orange-300 border-orange-800',
    card: 'hover:border-orange-700/50',
    count: 'text-orange-500',
    dropRing: 'ring-2 ring-inset ring-orange-600/60 bg-orange-950/20',
  },
  gray: {
    header: 'text-gray-400',
    badge: 'bg-gray-800 text-gray-400 border-gray-700',
    card: 'hover:border-gray-600',
    count: 'text-gray-600',
    dropRing: 'ring-2 ring-inset ring-gray-500/40 bg-gray-800/20',
  },
};

const BORDER_CLASSES: Record<Position, string> = {
  'top-left': 'border-r border-b border-gray-800',
  'top-right': 'border-b border-gray-800',
  'bottom-left': 'border-r border-gray-800',
  'bottom-right': '',
};

function QuadrantPanel({
  quadrant,
  label,
  accent,
  importance,
  tasks,
  position,
  isDragOver,
  onDrop,
  onDragOverChange,
  onDragStart,
  onDragEnd,
  draggingId,
}: {
  quadrant: Quadrant;
  label: string;
  accent: Accent;
  importance: string;
  tasks: readonly TaskWithLabels[];
  position: Position;
  isDragOver: boolean;
  onDrop: (q: Quadrant) => void;
  onDragOverChange: (q: Quadrant | null) => void;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  draggingId: string | null;
}): JSX.Element {
  const styles = ACCENT_STYLES[accent];

  return (
    <div
      className={`flex flex-col overflow-hidden transition-colors ${BORDER_CLASSES[position]} ${isDragOver ? styles.dropRing : ''}`}
      onDragOver={(e) => {
        e.preventDefault(); // required to allow drop
        onDragOverChange(quadrant);
      }}
      onDragLeave={(e) => {
        // Only fire when leaving the panel itself, not a child
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          onDragOverChange(null);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(quadrant);
      }}
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
          <p className="mt-4 text-center text-xs text-gray-700">
            {isDragOver ? 'Drop here' : 'Empty'}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tasks.map((task) => (
              <MatrixTaskCard
                key={task.id}
                task={task}
                styles={styles}
                isDragging={task.id === draggingId}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Task card ─────────────────────────────────────────────────────────────────

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
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  task: TaskWithLabels;
  styles: { badge: string; card: string };
  isDragging: boolean;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
}): JSX.Element {
  const due = formatDueDate(task.dueDate);

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.id);
        onDragStart(task.id);
      }}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 transition-all active:cursor-grabbing ${styles.card} ${
        isDragging ? 'opacity-40 scale-95' : 'opacity-100'
      }`}
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
          <span
            className={`rounded border px-1 py-0.5 text-[10px] ${styles.badge}`}
          >
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

// ── Confirmation modal ────────────────────────────────────────────────────────

const QUADRANT_LABEL: Record<Quadrant, string> = {
  do: 'Do',
  schedule: 'Schedule',
  delegate: 'Delegate',
  eliminate: 'Eliminate',
};

function ConfirmMoveModal({
  from,
  to,
  taskTitle,
  onConfirm,
  onCancel,
}: {
  from: Quadrant;
  to: Quadrant;
  taskTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
    >
      <div className="w-80 rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl">
        <h3 className="mb-1 text-sm font-semibold text-white">
          Move to {QUADRANT_LABEL[to]}?
        </h3>
        <p className="mb-4 text-xs text-gray-400">
          Moving{' '}
          <span className="font-medium text-gray-200">
            "{taskTitle || 'Untitled'}"
          </span>{' '}
          from{' '}
          <span className="font-medium text-gray-300">
            {QUADRANT_LABEL[from]}
          </span>{' '}
          to{' '}
          <span className="font-medium text-gray-300">
            {QUADRANT_LABEL[to]}
          </span>{' '}
          changes both priority and due date. Continue?
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  );
}
