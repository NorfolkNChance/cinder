import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-client';
import type {
  Note,
  NoteCreateInput,
  NoteUpdateInput,
} from '../../../../shared/schemas/notes';

/** Query key for the flat list of all daily notes. */
const dailyNotesQueryKey = [...queryKeys.notes.all, 'daily'] as const;

/**
 * TanStack Query hooks for the notes domain.
 *
 * Single source of truth for notes-related fetching and mutation in the
 * renderer. Hooks fan out to window.api.notes.* under the hood; the
 * components above stay declarative.
 */

/**
 * Fetch the list of regular notes, optionally filtered by folder scope.
 *
 * - `{ kind: 'all' }`           → all notes regardless of folder
 * - `{ kind: 'unfiled' }`       → only notes with no folder assigned
 * - `{ kind: 'folder', id }` → only notes in the specified folder
 */
export type NotesFolderScope =
  | { kind: 'all' }
  | { kind: 'unfiled' }
  | { kind: 'folder'; id: string };

export function useNotesList(
  scope: NotesFolderScope = { kind: 'all' },
): ReturnType<typeof useQuery<readonly Note[]>> {
  // Derive the folderId filter from the scope.
  const input =
    scope.kind === 'all'
      ? {}
      : scope.kind === 'unfiled'
      ? { folderId: null as null }
      : { folderId: scope.id };

  return useQuery({
    queryKey: [...queryKeys.notes.list(), scope] as const,
    queryFn: () => window.api.notes.list(input),
  });
}

/**
 * Fetch the regular notes assigned to a specific project.
 *
 * Used by the project view (Tasks mode, project scope) to list a project's
 * notes alongside its tasks. Daily notes are excluded by the service default.
 */
export function useProjectNotes(
  projectId: string | null,
): ReturnType<typeof useQuery<readonly Note[]>> {
  return useQuery({
    queryKey: [...queryKeys.notes.list(), 'project', projectId] as const,
    queryFn: () =>
      projectId === null
        ? Promise.resolve([] as readonly Note[])
        : window.api.notes.list({ projectId }),
    enabled: projectId !== null,
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

// ── Daily Notes ───────────────────────────────────────────────────────────────

/**
 * Fetch the flat list of all daily notes (daily_date IS NOT NULL).
 * The DailySidebar groups them into a year → month → day tree.
 */
export function useDailyNotesList(): ReturnType<typeof useQuery<readonly Note[]>> {
  return useQuery({
    queryKey: dailyNotesQueryKey,
    queryFn: () => window.api.notes.list({ dailyOnly: true, limit: 1000 }),
  });
}

/**
 * Get-or-create the daily note for a YYYY-MM-DD date string.
 *
 * Fires as a mutation (not a query) because it may have a write-side effect.
 * On success:
 *   - Invalidates the daily notes list so the sidebar tree reflects the new
 *     note immediately.
 *   - Returns the Note so the caller can open it in the editor.
 */
export function useGetOrCreateDaily(): ReturnType<
  typeof useMutation<Note, Error, string>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) =>
      window.api.notes.getOrCreateDaily({ date }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dailyNotesQueryKey });
    },
  });
}
