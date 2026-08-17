import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  useTasksList,
  useAllTasksList,
  useUpdateTask,
} from '../tasks/queries';
import { useGetOrCreateDaily } from '../notes/queries';
import { useTomorrowTasks, useSinceLastSession } from './queries';
import {
  groupOverdue,
  pickDoFirst,
  splitTodayScope,
  type OverdueGroup,
} from './selectors';
import { SummaryTaskRow } from './SummaryTaskRow';
import { TriageCard } from '../tasks/TriageCard';
import { useUI } from '../../state/ui';
import { localDateString } from '../../lib/dates';
import type { Note } from '../../../../shared/schemas/notes';
import type { TaskWithLabels } from '../../../../shared/schemas/tasks';

/**
 * Summary mode — the landing dashboard (ADR-0017).
 *
 * A read-mostly aggregation over the existing tasks/notes queries answering
 * three questions: what needs attention (overdue, due today, triage), what
 * to do first (Eisenhower Q1 short-list), and what happened since the last
 * session. Full-width, no sidebar; cards are stacked in priority order.
 */
export function SummaryPane(): JSX.Element {
  const today = localDateString();

  const todayScope = useTasksList({ kind: 'today' });
  const triage = useTasksList({ kind: 'triage' });
  const allActive = useAllTasksList();
  const tomorrow = useTomorrowTasks();
  const matrixPrefs = useUI((s) => s.matrixPrefs);

  const { overdue, today: dueToday } = useMemo(
    () => splitTodayScope(todayScope.data ?? [], today),
    [todayScope.data, today],
  );
  const overdueGroups = useMemo(
    () => groupOverdue(overdue, today),
    [overdue, today],
  );
  const doFirst = useMemo(
    () => pickDoFirst(allActive.data ?? [], matrixPrefs),
    [allActive.data, matrixPrefs],
  );

  const loaded =
    todayScope.data !== undefined &&
    triage.data !== undefined &&
    allActive.data !== undefined;
  const allClear =
    loaded &&
    overdue.length === 0 &&
    dueToday.length === 0 &&
    (triage.data?.length ?? 0) === 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <SummaryHeader />

        {!loaded ? null : (
          <div className="flex flex-col gap-4">
            {allClear && <AllClearBanner />}
            {doFirst.length > 0 && <DoFirstCard tasks={doFirst} />}
            {overdue.length > 0 && (
              <OverdueCard groups={overdueGroups} count={overdue.length} />
            )}
            {dueToday.length > 0 && (
              <DueTodayCard
                tasks={dueToday}
                tomorrowCount={tomorrow.data?.length ?? 0}
                tomorrowTasks={tomorrow.data ?? []}
              />
            )}
            {(triage.data?.length ?? 0) > 0 && (
              <TriageSummaryCard tasks={triage.data ?? []} />
            )}
            <SinceLastSessionCard />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

function SummaryHeader(): JSX.Element {
  const getOrCreate = useGetOrCreateDaily();
  const setMode = useUI((s) => s.setMode);
  const setDailySelectedNoteId = useUI((s) => s.setDailySelectedNoteId);
  const setSelectedDailyDate = useUI((s) => s.setSelectedDailyDate);

  // Weekday + date, e.g. "Sunday, 17 August". Noon-local parse is not needed
  // here because we format `new Date()` directly, never a YYYY-MM-DD string.
  const heading = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const openTodayNote = (): void => {
    const date = localDateString();
    getOrCreate.mutate(date, {
      onSuccess: (note) => {
        setDailySelectedNoteId(note.id);
        setSelectedDailyDate(date);
        setMode('daily');
      },
    });
  };

  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          {heading}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-500">
          Here&apos;s where things stand.
        </p>
      </div>
      <button
        onClick={openTodayNote}
        disabled={getOrCreate.isPending}
        className="flex-shrink-0 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        📅 Today&apos;s note →
      </button>
    </header>
  );
}

function AllClearBanner(): JSX.Element {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900 dark:bg-emerald-950/40">
      <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
        All clear — nothing overdue, nothing due today, nothing in triage.
      </p>
    </div>
  );
}

// ── Card frame ───────────────────────────────────────────────────────────────

function Card({
  icon,
  title,
  count,
  tone = 'neutral',
  action,
  children,
}: {
  icon: string;
  title: string;
  count?: number;
  tone?: 'neutral' | 'danger' | 'amber';
  action?: JSX.Element;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section
      aria-label={title}
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
    >
      <header className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
          <span aria-hidden="true">{icon}</span>
          {title}
          {count !== undefined && (
            <span
              className={clsx(
                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                tone === 'danger' &&
                  'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
                tone === 'amber' &&
                  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
                tone === 'neutral' &&
                  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
              )}
            >
              {count}
            </span>
          )}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

// ── Do first ─────────────────────────────────────────────────────────────────

function DoFirstCard({ tasks }: { tasks: TaskWithLabels[] }): JSX.Element {
  return (
    <Card icon="🎯" title="Do first" count={tasks.length}>
      <p className="mb-1.5 text-[11px] text-gray-500 dark:text-gray-500">
        Urgent and important, by your Matrix thresholds.
      </p>
      <ul>
        {tasks.map((t) => (
          <SummaryTaskRow key={t.id} task={t} />
        ))}
      </ul>
    </Card>
  );
}

// ── Overdue ──────────────────────────────────────────────────────────────────

function OverdueCard({
  groups,
  count,
}: {
  groups: OverdueGroup<TaskWithLabels>[];
  count: number;
}): JSX.Element {
  const updateTask = useUpdateTask();
  const today = localDateString();

  const rescheduleAll = (): void => {
    for (const group of groups) {
      for (const task of group.tasks) {
        updateTask.mutate({ id: task.id, patch: { dueDate: today } });
      }
    }
  };

  return (
    <Card
      icon="⏰"
      title="Overdue"
      count={count}
      tone="danger"
      action={
        <button
          onClick={rescheduleAll}
          disabled={updateTask.isPending}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          title="Set every overdue task's due date to today"
        >
          Move all to today
        </button>
      }
    >
      {groups.map((group) => (
        <div key={group.label} className="mb-1 last:mb-0">
          <p className="mb-0.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-600">
            {group.label}
          </p>
          <ul>
            {group.tasks.map((t) => (
              <SummaryTaskRow key={t.id} task={t} />
            ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}

// ── Due today ────────────────────────────────────────────────────────────────

function DueTodayCard({
  tasks,
  tomorrowCount,
  tomorrowTasks,
}: {
  tasks: readonly TaskWithLabels[];
  tomorrowCount: number;
  tomorrowTasks: readonly TaskWithLabels[];
}): JSX.Element {
  const [showTomorrow, setShowTomorrow] = useState(false);

  return (
    <Card icon="📌" title="Due today" count={tasks.length}>
      <ul>
        {tasks.map((t) => (
          <SummaryTaskRow key={t.id} task={t} showDue={false} />
        ))}
      </ul>
      {tomorrowCount > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-800">
          <button
            onClick={() => setShowTomorrow((v) => !v)}
            aria-expanded={showTomorrow}
            className="px-2 text-[11px] text-gray-500 transition hover:text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded dark:hover:text-gray-300"
          >
            {showTomorrow ? '▾' : '▸'} {tomorrowCount} due tomorrow
          </button>
          {showTomorrow && (
            <ul className="mt-1">
              {tomorrowTasks.map((t) => (
                <SummaryTaskRow key={t.id} task={t} showDue={false} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Triage ───────────────────────────────────────────────────────────────────

const TRIAGE_INLINE_CAP = 2;

function TriageSummaryCard({
  tasks,
}: {
  tasks: readonly TaskWithLabels[];
}): JSX.Element {
  const setMode = useUI((s) => s.setMode);
  const setTaskScope = useUI((s) => s.setTaskScope);
  const remainder = tasks.length - TRIAGE_INLINE_CAP;

  return (
    <Card
      icon="📥"
      title="Triage"
      count={tasks.length}
      tone="amber"
      action={
        <button
          onClick={() => {
            setTaskScope({ kind: 'triage' });
            setMode('tasks');
          }}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          Open Triage →
        </button>
      }
    >
      <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-500">
        Captured tasks waiting to be set up and acknowledged.
      </p>
      <ul className="flex flex-col gap-3">
        {tasks.slice(0, TRIAGE_INLINE_CAP).map((t) => (
          <TriageCard key={t.id} task={t} />
        ))}
      </ul>
      {remainder > 0 && (
        <p className="mt-2 px-2 text-[11px] text-gray-500 dark:text-gray-500">
          + {remainder} more in Triage
        </p>
      )}
    </Card>
  );
}

// ── Since last session ───────────────────────────────────────────────────────

function SinceLastSessionCard(): JSX.Element | null {
  const { since, firstRun, completed, created, editedNotes, isLoading } =
    useSinceLastSession();

  if (isLoading) return null;

  const completedList = completed ?? [];
  const createdList = created ?? [];
  const notesList = editedNotes ?? [];
  const empty =
    completedList.length === 0 &&
    createdList.length === 0 &&
    notesList.length === 0;

  return (
    <Card icon="🕰" title="Since last session">
      <p className="mb-1.5 text-[11px] text-gray-500 dark:text-gray-500">
        {firstRun ? 'Since midnight.' : `Since ${formatSince(since)}.`}
      </p>
      {empty ? (
        <p className="px-2 text-sm text-gray-500 dark:text-gray-500">
          No changes while you were away.
        </p>
      ) : (
        <>
          {completedList.length > 0 && (
            <SubList label={`Completed (${completedList.length})`}>
              {completedList.map((t) => (
                <SummaryTaskRow key={t.id} task={t} done showDue={false} />
              ))}
            </SubList>
          )}
          {createdList.length > 0 && (
            <SubList label={`New tasks (${createdList.length})`}>
              {createdList.map((t) => (
                <SummaryTaskRow key={t.id} task={t} />
              ))}
            </SubList>
          )}
          {notesList.length > 0 && (
            <SubList label={`Notes edited (${notesList.length})`}>
              {notesList.map((n) => (
                <NoteRow key={n.id} note={n} />
              ))}
            </SubList>
          )}
        </>
      )}
    </Card>
  );
}

function SubList({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="mb-1 last:mb-0">
      <p className="mb-0.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-600">
        {label}
      </p>
      <ul>{children}</ul>
    </div>
  );
}

function NoteRow({ note }: { note: Note }): JSX.Element {
  const setMode = useUI((s) => s.setMode);
  const setSelectedNoteId = useUI((s) => s.setSelectedNoteId);
  return (
    <li>
      <button
        onClick={() => {
          setSelectedNoteId(note.id);
          setMode('notes');
        }}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:hover:bg-gray-800/60"
      >
        <span aria-hidden="true" className="text-xs">
          📝
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">
          {note.title !== '' ? note.title : 'Untitled note'}
        </span>
      </button>
    </li>
  );
}

/** "yesterday 18:42" / "today 09:15" / "12 Aug, 18:42" from a UTC instant. */
function formatSince(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'your last session';
  const time = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diffDays === 0) return `today ${time}`;
  if (diffDays === 1) return `yesterday ${time}`;
  const date = d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  return `${date}, ${time}`;
}
