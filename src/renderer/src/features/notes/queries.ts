import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-client';
import type {
  Note,
  NoteCreateInput,
  NoteUpdateInput,
} from '../../../../shared/schemas/notes';

/**
 * TanStack Query hooks for the notes domain.
 *
 * Single source of truth for notes-related fetching and mutation in the
 * renderer. Hooks fan out to window.api.notes.* under the hood; the
 * components above stay declarative.
 */

export function useNotesList(): ReturnType<typeof useQuery<readonly Note[]>> {
  return useQuery({
    queryKey: queryKeys.notes.list(),
    queryFn: () => window.api.notes.list({}),
  });
}

/**
 * FTS5 search over note titles and bodies.
 *
 * Disabled (no query fired) for empty queries — the caller should be
 * passing a debounced value so we don't hammer the IPC. Results are
 * cached per-query so re-typing the same query is instant.
 */
export function useNotesSearch(
  query: string,
): ReturnType<typeof useQuery<readonly Note[]>> {
  const trimmed = query.trim();
  return useQuery({
    queryKey: [...queryKeys.notes.all, 'search', trimmed] as const,
    queryFn: () => window.api.notes.search({ query: trimmed }),
    enabled: trimmed.length > 0,
  });
}

export function useNote(
  id: string | null,
): ReturnType<typeof useQuery<Note | null>> {
  return useQuery({
    queryKey: id ? queryKeys.notes.detail(id) : ['notes', 'detail', '__none__'],
    queryFn: () => (id ? window.api.notes.get({ id }) : Promise.resolve(null)),
    enabled: id !== null,
  });
}

export function useCreateNote(): ReturnType<
  typeof useMutation<Note, Error, NoteCreateInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NoteCreateInput) => window.api.notes.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notes.all });
    },
  });
}

export function useUpdateNote(): ReturnType<
  typeof useMutation<Note | null, Error, NoteUpdateInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NoteUpdateInput) => window.api.notes.update(input),
    onSuccess: (note, vars) => {
      // Optimistic-ish: write the fresh note into the detail cache so the
      // currently-open editor doesn't refetch. Then invalidate everything
      // under notes (list, search, other details) so list ordering and
      // search results pick up the changed title/body.
      if (note) {
        qc.setQueryData(queryKeys.notes.detail(vars.id), note);
      }
      void qc.invalidateQueries({ queryKey: queryKeys.notes.all });
    },
  });
}

export function useDeleteNote(): ReturnType<
  typeof useMutation<void, Error, string>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.notes.delete({ id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notes.all });
    },
  });
}
