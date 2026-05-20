import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-client';
import type {
  Project,
  ProjectCreateInput,
} from '../../../../shared/schemas/projects';
import type {
  Task,
  TaskCompleteInput,
  TaskCreateInput,
  TaskListInput,
  TaskUpdateInput,
  TaskWithLabels,
} from '../../../../shared/schemas/tasks';
import type {
  Label,
  LabelCreateInput,
} from '../../../../shared/schemas/labels';
import type {
  SavedFilter,
  SavedFilterCreateInput,
} from '../../../../shared/schemas/savedFilters';
import type { TaskScope } from '../../state/ui';
import { addDays, localDateString } from '../../lib/dates';

/**
 * TanStack Query hooks for the tasks and projects domains.
 *
 * Mutations invalidate the `tasks.all` / `projects.all` prefix so every
 * cached list refreshes — easier to maintain than per-scope invalidation
 * and the cost is negligible for the volumes this app deals in.
 */

// ── Projects ────────────────────────────────────────────────────────────────

export function useProjectsList(): ReturnType<
  typeof useQuery<readonly Project[]>
> {
  return useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: () => window.api.projects.list({}),
  });
}

export function useCreateProject(): ReturnType<
  typeof useMutation<Project, Error, ProjectCreateInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectCreateInput) =>
      window.api.projects.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

export function useDeleteProject(): ReturnType<
  typeof useMutation<void, Error, string>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.projects.delete({ id }),
    onSuccess: () => {
      // Project delete cascades to its sections and SETs NULL on its
      // tasks (FK constraint). Invalidate both domains.
      void qc.invalidateQueries({ queryKey: queryKeys.projects.all });
      void qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

// ── Tasks ───────────────────────────────────────────────────────────────────

/**
 * Translate a UI-level TaskScope into the service-level filter args.
 * Kept in this module so the renderer never has to know that "Inbox"
 * means projectId:null or that "Today" is a half-open dueBefore window
 * computed in local time.
 *
 * Today window: due_date < start-of-tomorrow (strict — see services/
 * tasks.ts comment) catches every task whose date or datetime falls
 * on today or earlier.
 *
 * Upcoming window: due_date >= start-of-tomorrow (everything after
 * today). No upper bound for v1 — tasks far in the future are rare
 * enough that capping at, say, 30 days doesn't earn its complexity.
 */
function scopeToFilter(
  scope: TaskScope,
  savedFilterExpression: string | null,
): TaskListInput {
  switch (scope.kind) {
    case 'inbox':
      return { projectId: null };
    case 'today': {
      const tomorrow = localDateString(addDays(new Date(), 1));
      return { dueBefore: tomorrow };
    }
    case 'upcoming': {
      const tomorrow = localDateString(addDays(new Date(), 1));
      return { dueOnOrAfter: tomorrow };
    }
    case 'project':
      return { projectId: scope.id };
    case 'label':
      return { labelId: scope.id };
    case 'filter':
      // The saved-filter row is fetched from the cache by useTasksList
      // before this gets called; if it isn't available yet we return
      // an empty filter (results empty) — better than a runtime throw.
      return savedFilterExpression === null
        ? { filter: '' }
        : { filter: savedFilterExpression };
  }
}

export function useTasksList(
  scope: TaskScope,
): ReturnType<typeof useQuery<readonly TaskWithLabels[]>> {
  // For 'filter' scope we need the saved filter's expression. Pull from
  // the cached list rather than firing a separate fetch — the sidebar
  // is already rendering this data.
  const savedFilters = useSavedFiltersList();
  const expression =
    scope.kind === 'filter'
      ? (savedFilters.data?.find((f) => f.id === scope.id)?.expression ??
        null)
      : null;
  return useQuery({
    queryKey:
      scope.kind === 'filter'
        ? [...queryKeys.tasks.list(scope), expression]
        : queryKeys.tasks.list(scope),
    queryFn: () => window.api.tasks.list(scopeToFilter(scope, expression)),
    // Wait until the saved-filter list resolves before running the
    // filter-scoped query.
    enabled: scope.kind !== 'filter' || savedFilters.data !== undefined,
  });
}

export function useCreateTask(): ReturnType<
  typeof useMutation<Task, Error, TaskCreateInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskCreateInput) => window.api.tasks.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

export function useUpdateTask(): ReturnType<
  typeof useMutation<Task | null, Error, TaskUpdateInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskUpdateInput) => window.api.tasks.update(input),
    onSuccess: () => {
      // Changing dueDate or projectId moves a task across cached scopes
      // (e.g. setting today's date pulls it into the Today list). Wipe
      // all task caches rather than tracking which scopes the patch
      // affected — list volumes are small enough that this is cheap.
      void qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

export function useCompleteTask(): ReturnType<
  typeof useMutation<Task | null, Error, TaskCompleteInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskCompleteInput) =>
      window.api.tasks.complete(input),
    onSuccess: () => {
      // The list filters completed tasks by default — toggling completion
      // changes membership, so all scoped lists need a refresh.
      void qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

/**
 * Fetch every active (not completed, not deleted) task — used by the
 * Eisenhower matrix view which needs the full task set before it
 * classifies into quadrants.
 */
export function useAllTasksList(): ReturnType<
  typeof useQuery<readonly TaskWithLabels[]>
> {
  return useQuery({
    queryKey: [...queryKeys.tasks.all, 'list', 'all'],
    queryFn: () => window.api.tasks.list({}),
  });
}

export function useDeleteTask(): ReturnType<
  typeof useMutation<void, Error, string>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.tasks.delete({ id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

// ── Labels ──────────────────────────────────────────────────────────────────

export function useLabelsList(): ReturnType<
  typeof useQuery<readonly Label[]>
> {
  return useQuery({
    queryKey: queryKeys.labels.list(),
    queryFn: () => window.api.labels.list({}),
  });
}

export function useCreateLabel(): ReturnType<
  typeof useMutation<Label, Error, LabelCreateInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LabelCreateInput) => window.api.labels.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.labels.all });
    },
  });
}

export function useDeleteLabel(): ReturnType<
  typeof useMutation<void, Error, string>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.labels.delete({ id }),
    onSuccess: () => {
      // FK cascade removes task_labels rows attached to this label, so
      // affected task lists need a refresh too.
      void qc.invalidateQueries({ queryKey: queryKeys.labels.all });
      void qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

// ── Saved filters ───────────────────────────────────────────────────────────

export function useSavedFiltersList(): ReturnType<
  typeof useQuery<readonly SavedFilter[]>
> {
  return useQuery({
    queryKey: queryKeys.savedFilters.list(),
    queryFn: () => window.api.savedFilters.list({}),
  });
}

export function useCreateSavedFilter(): ReturnType<
  typeof useMutation<SavedFilter, Error, SavedFilterCreateInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SavedFilterCreateInput) =>
      window.api.savedFilters.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.savedFilters.all });
    },
  });
}

export function useDeleteSavedFilter(): ReturnType<
  typeof useMutation<void, Error, string>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.savedFilters.delete({ id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.savedFilters.all });
    },
  });
}
