import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../lib/query-client';
import { useCreateTask, useLabelsList, useProjectsList } from '../tasks/queries';
import { parseQuickAdd } from '../tasks/quickAdd';
import { formatDueDate } from '../../lib/dates';
import { describeRecurrence } from '../../../../shared/recurrence';
import type { TaskCreateInput } from '../../../../shared/schemas/tasks';

/**
 * Entry point rendered when the capture popup loads with `?mode=capture`.
 * Wraps the UI in its own QueryClientProvider (separate cache from the main
 * window's renderer process).
 */
export function QuickCaptureRoot(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <QuickCaptureTheme>
        <QuickCaptureApp />
      </QuickCaptureTheme>
    </QueryClientProvider>
  );
}

/**
 * Applies dark/light class to <html> based on the OS system preference.
 * Using the system preference directly (rather than the persisted app
 * setting) avoids a loading flash while the settings IPC call resolves.
 */
function QuickCaptureTheme({ children }: { children: ReactNode }): JSX.Element {
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (dark: boolean): void => {
      dark ? root.classList.add('dark') : root.classList.remove('dark');
    };
    apply(mq.matches);
    const handler = (e: MediaQueryListEvent): void => apply(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return <>{children}</>;
}

/**
 * Frameless quick-capture popup.
 *
 * Single text input with the same NLP parser as the main task list.
 * Submitting creates a Triage task (triage=1) then hides the window.
 * Escape also hides without creating.
 *
 * The NLP preview chips appear below the input so the user can see what
 * properties were parsed (same UX as the main quick-add bar).
 */
function QuickCaptureApp(): JSX.Element {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: projects } = useProjectsList();
  const { data: labels } = useLabelsList();
  const createTask = useCreateTask();

  // Focus and clear every time the window comes to the foreground.
  // The component stays mounted between hide/show cycles; the OS 'focus'
  // event fires each time the popup is re-shown.
  useEffect(() => {
    const onFocus = (): void => {
      setDraft('');
      // Small rAF so the element is painted before focus is called.
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener('focus', onFocus);
    // Also focus on first mount.
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Escape → dismiss without creating.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void window.api.capture.hide();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const parsed = useMemo(
    () => parseQuickAdd(draft, { projects: projects ?? [], labels: labels ?? [] }),
    [draft, projects, labels],
  );

  const submit = useCallback(async () => {
    const title = parsed.title.trim();
    if (title === '' && parsed.dueDate === null && parsed.priority === null) {
      // Nothing useful typed — just dismiss.
      void window.api.capture.hide();
      return;
    }
    await createTask.mutateAsync(buildInput(parsed));
    setDraft('');
    void window.api.capture.hide();
  }, [parsed, createTask]);

  const hasPreview =
    draft.length > 0 &&
    (parsed.dueDate !== null ||
      parsed.priority !== null ||
      parsed.projectId !== null ||
      parsed.labelIds.length > 0 ||
      parsed.recurrence !== null);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 dark:border-gray-800">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">
          Quick Capture
        </span>
        <kbd className="text-[10px] text-gray-300 dark:text-gray-700">
          ⌘⇧Space
        </kbd>
      </div>

      {/* Text input */}
      <div className="flex items-center gap-2 px-3 py-3">
        <span className="text-sm text-gray-300 dark:text-gray-600" aria-hidden="true">
          ✎
        </span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={'Task title — try "tomorrow p2 #project"'}
          aria-label="New task title"
          className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none dark:text-white dark:placeholder-gray-600"
        />
      </div>

      {/* Preview chips + action buttons */}
      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {hasPreview && (
            <>
              {parsed.dueDate !== null && (
                <Chip color="emerald">{formatDueDate(parsed.dueDate)}</Chip>
              )}
              {parsed.priority !== null && (
                <Chip color={priorityColor(parsed.priority)}>
                  P{parsed.priority}
                </Chip>
              )}
              {parsed.projectId !== null && (
                <Chip color="indigo">
                  #{projects?.find((p) => p.id === parsed.projectId)?.name ?? '?'}
                </Chip>
              )}
              {labels
                ?.filter((l) => parsed.labelIds.includes(l.id))
                .map((l) => (
                  <Chip key={l.id} color="teal">
                    @{l.name}
                  </Chip>
                ))}
              {parsed.recurrence !== null && (
                <Chip color="purple">
                  ↻ {describeRecurrence(parsed.recurrence)}
                </Chip>
              )}
            </>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            onClick={() => void window.api.capture.hide()}
            className="rounded px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:hover:text-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={createTask.isPending}
            className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          >
            {createTask.isPending ? 'Adding…' : 'Add to Triage'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildInput(parsed: ReturnType<typeof parseQuickAdd>): TaskCreateInput {
  return {
    title: parsed.title,
    triage: 1,
    ...(parsed.projectId !== null ? { projectId: parsed.projectId } : {}),
    ...(parsed.dueDate !== null ? { dueDate: parsed.dueDate } : {}),
    ...(parsed.priority !== null ? { priority: parsed.priority } : {}),
    ...(parsed.recurrence !== null ? { dueRecurrence: parsed.recurrence } : {}),
    ...(parsed.labelIds.length > 0 ? { labelIds: [...parsed.labelIds] } : {}),
  };
}

type ChipColor =
  | 'emerald'
  | 'red'
  | 'orange'
  | 'blue'
  | 'gray'
  | 'indigo'
  | 'purple'
  | 'teal';

function Chip({
  color,
  children,
}: {
  color: ChipColor;
  children: ReactNode;
}): JSX.Element {
  const palette: Record<ChipColor, string> = {
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
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] ${palette[color]}`}
    >
      {children}
    </span>
  );
}

function priorityColor(p: 1 | 2 | 3 | 4): ChipColor {
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
