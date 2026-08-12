import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-client';
import { useUI } from '../../state/ui';
import type { Note } from '../../../../shared/schemas/notes';
import type { Task } from '../../../../shared/schemas/tasks';

/**
 * TanStack Query hooks for the Trash view.
 *
 * Trash lists are cached under their own key family; the mutations
 * invalidate both the trash keys and the owning domain's `all` prefix so
 * a restored note/task immediately reappears in its normal list.
 */

function reportTrashError(message: string, err: Error): void {
  console.error(`[cinder] ${message}:`, err);
  useUI.getState().showToast(message, 'error');
}

export function useTrashedNotes(
  enabled: boolean,
): ReturnType<typeof useQuery<readonly Note[]>> {
  return useQuery({
    queryKey: queryKeys.trash.notes(),
    queryFn: () => window.api.notes.listDeleted({}),
    enabled,
  });
}

export function useTrashedTasks(
  enabled: boolean,
): ReturnType<typeof useQuery<readonly Task[]>> {
  return useQuery({
    queryKey: queryKeys.trash.tasks(),
    queryFn: () => window.api.tasks.listDeleted({}),
    enabled,
  });
}

export function useRestoreNote(): ReturnType<
  typeof useMutation<Note | null, Error, string>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.notes.restore({ id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.trash.all });
      void qc.invalidateQueries({ queryKey: queryKeys.notes.all });
      useUI.getState().showToast('Note restored', 'success');
    },
    onError: (err) => reportTrashError('Failed to restore note', err),
  });
}

export function useRestoreTask(): ReturnType<
  typeof useMutation<Task | null, Error, string>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.tasks.restore({ id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.trash.all });
      void qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
      useUI.getState().showToast('Task restored', 'success');
    },
    onError: (err) => reportTrashError('Failed to restore task', err),
  });
}

export function useHardDeleteNote(): ReturnType<
  typeof useMutation<void, Error, string>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.notes.hardDelete({ id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.trash.all });
    },
    onError: (err) => reportTrashError('Failed to delete note', err),
  });
}

export function useHardDeleteTask(): ReturnType<
  typeof useMutation<void, Error, string>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.tasks.hardDelete({ id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.trash.all });
    },
    onError: (err) => reportTrashError('Failed to delete task', err),
  });
}
