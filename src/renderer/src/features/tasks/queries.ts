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
} from '../../../../shared/schemas/tasks';
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
function scopeToFilter(scope: TaskScope): TaskListInput {
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
  }
}

export function useTasksList(
  scope: TaskScope,
): ReturnType<typeof useQuery<readonly Task[]>> {
  return useQuery({
    queryKey: queryKeys.tasks.list(scope),
    queryFn: () => window.api.tasks.list(scopeToFilter(scope)),
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
