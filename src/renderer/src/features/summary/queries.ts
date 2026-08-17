import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-client';
import { useSettings } from '../settings/useSettings';
import { addDays, localDateString } from '../../lib/dates';
import type { TaskWithLabels } from '../../../../shared/schemas/tasks';
import type { Note } from '../../../../shared/schemas/notes';

/**
 * Summary-specific query hooks.
 *
 * Deliberately thin: every hook composes the existing `tasks:list` /
 * `notes:list` IPC with summary-specific filters, and every key sits under
 * the `tasks.all` / `notes.all` prefixes so the existing mutation
 * invalidations refresh Summary cards for free (see ADR-0017).
 *
 * The overdue/today, triage, and do-first cards don't need hooks here —
 * they reuse `useTasksList` / `useAllTasksList` from features/tasks/queries
 * directly, sharing their cache entries with the Tasks views.
 */

/** Tasks due tomorrow — the collapsed preview under the Due Today card. */
export function useTomorrowTasks(): ReturnType<
  typeof useQuery<readonly TaskWithLabels[]>
> {
  const tomorrow = localDateString(addDays(new Date(), 1));
  const dayAfter = localDateString(addDays(new Date(), 2));
  return useQuery({
    // Date-stamped key: after midnight the window shifts, so yesterday's
    // cache entry must not be reused for the new "tomorrow".
    queryKey: [...queryKeys.tasks.all, 'list', 'summary-tomorrow', tomorrow],
    queryFn: () =>
      window.api.tasks.list({ dueOnOrAfter: tomorrow, dueBefore: dayAfter }),
  });
}

export interface SinceLastSession {
  /** The UTC instant deltas are computed from (last quit, or start of today). */
  since: string;
  /** True when there was no recorded previous session (first run). */
  firstRun: boolean;
  completed: readonly TaskWithLabels[] | undefined;
  created: readonly TaskWithLabels[] | undefined;
  editedNotes: readonly Note[] | undefined;
  isLoading: boolean;
}

/**
 * "Since you were away" deltas. The baseline is `summary.lastSessionEndedAt`,
 * written by the main process on quit — during the whole current session it
 * holds the *previous* session's end, so no snapshotting is needed. Falls
 * back to local start-of-today (as a UTC instant) on first run.
 */
export function useSinceLastSession(): SinceLastSession {
  const { settings } = useSettings();
  const stamped = settings?.['summary.lastSessionEndedAt'] ?? '';
  const firstRun = stamped === '';
  const since = firstRun ? startOfTodayIso() : stamped;
  const enabled = settings !== undefined;

  const completed = useQuery({
    queryKey: [...queryKeys.tasks.all, 'list', 'summary-completed', since],
    queryFn: () => window.api.tasks.list({ completedAfter: since }),
    enabled,
  });
  const created = useQuery({
    queryKey: [...queryKeys.tasks.all, 'list', 'summary-created', since],
    queryFn: () => window.api.tasks.list({ createdAfter: since }),
    enabled,
  });
  const editedNotes = useQuery({
    queryKey: [...queryKeys.notes.all, 'list', 'summary-edited', since],
    queryFn: () => window.api.notes.list({ updatedAfter: since, limit: 10 }),
    enabled,
  });

  return {
    since,
    firstRun,
    completed: completed.data,
    created: created.data,
    editedNotes: editedNotes.data,
    isLoading:
      !enabled ||
      completed.isLoading ||
      created.isLoading ||
      editedNotes.isLoading,
  };
}

/** Local midnight of today, expressed as a UTC ISO instant. */
function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
