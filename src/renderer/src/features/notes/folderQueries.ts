import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-client';
import type {
  Folder,
  FolderCreateInput,
  FolderUpdateInput,
} from '../../../../shared/schemas/folders';

/**
 * TanStack Query hooks for the folders domain.
 * Kept in a separate file from notes queries to avoid circular imports.
 */

/** Fetch all folders (unfiltered). The FolderTree builds the hierarchy client-side. */
export function useFoldersList(): ReturnType<typeof useQuery<readonly Folder[]>> {
  return useQuery({
    queryKey: queryKeys.folders.list(),
    queryFn: () => window.api.folders.list({}),
  });
}

export function useCreateFolder(): ReturnType<
  typeof useMutation<Folder, Error, FolderCreateInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FolderCreateInput) => window.api.folders.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
  });
}

export function useUpdateFolder(): ReturnType<
  typeof useMutation<Folder | null, Error, FolderUpdateInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FolderUpdateInput) => window.api.folders.update(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
  });
}

export function useDeleteFolder(): ReturnType<
  typeof useMutation<{ ok: true } | { ok: false; reason: string }, Error, string>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.folders.delete({ id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.folders.all });
      // Notes may have been moved to Unfiled, so refresh the notes list too.
      void qc.invalidateQueries({ queryKey: queryKeys.notes.all });
    },
  });
}
