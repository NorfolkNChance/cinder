import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-client';
import type { Note } from '../../../../shared/schemas/notes';
import type { Task } from '../../../../shared/schemas/tasks';
import type {
  LinkCreateInput,
  LinkDeleteInput,
} from '../../../../shared/schemas/links';

/**
 * TanStack Query hooks for the note ↔ task links domain.
 *
 * Links are symmetric, so any create/delete invalidates the whole `links.all`
 * prefix — both the note-side and task-side cached lists refresh regardless
 * of which end triggered the mutation.
 */

/** Tasks linked to a note. */
export function useLinksForNote(
  noteId: string | null,
): ReturnType<typeof useQuery<readonly Task[]>> {
  return useQuery({
    queryKey: noteId
      ? queryKeys.links.forNote(noteId)
      : ['links', 'forNote', '__none__'],
    queryFn: () =>
      noteId
        ? window.api.links.listForNote({ noteId })
        : Promise.resolve([] as readonly Task[]),
    enabled: noteId !== null,
  });
}

/** Notes linked to a task. */
export function useLinksForTask(
  taskId: string | null,
): ReturnType<typeof useQuery<readonly Note[]>> {
  return useQuery({
    queryKey: taskId
      ? queryKeys.links.forTask(taskId)
      : ['links', 'forTask', '__none__'],
    queryFn: () =>
      taskId
        ? window.api.links.listForTask({ taskId })
        : Promise.resolve([] as readonly Note[]),
    enabled: taskId !== null,
  });
}

export function useCreateLink(): ReturnType<
  typeof useMutation<void, Error, LinkCreateInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LinkCreateInput) => window.api.links.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.links.all });
    },
  });
}

export function useDeleteLink(): ReturnType<
  typeof useMutation<void, Error, LinkDeleteInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LinkDeleteInput) => window.api.links.delete(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.links.all });
    },
  });
}
