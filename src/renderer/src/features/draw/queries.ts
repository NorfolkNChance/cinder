import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-client';
import type { Note } from '../../../../shared/schemas/notes';

/**
 * TanStack Query hooks for the drawings domain.
 *
 * Drawings are notes with `bodyType: 'excalidraw'` (see ADR — storage reuses the
 * notes table). These hooks are thin wrappers over `window.api.notes.*` that
 * pin the bodyType / drawingsOnly filter, so Draw mode never sees regular notes
 * and vice-versa. Detail/update/delete reuse the generic notes hooks
 * (`useNote`, `useUpdateNote`, `useDeleteNote`) — a drawing is just a note.
 */

/** Query key for the flat list of all drawings. */
const drawingsQueryKey = [...queryKeys.notes.all, 'drawings'] as const;

/** Fetch all drawings, newest-updated first. */
export function useDrawingsList(): ReturnType<typeof useQuery<readonly Note[]>> {
  return useQuery({
    queryKey: drawingsQueryKey,
    queryFn: () => window.api.notes.list({ drawingsOnly: true, limit: 1000 }),
  });
}

/**
 * Create a new, empty drawing and return it. The body starts as '' — the
 * editor writes a serialized scene on first change. Invalidates the drawings
 * list so the new drawing appears in the sidebar immediately.
 */
export function useCreateDrawing(): ReturnType<
  typeof useMutation<Note, Error, { title: string }>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ title }: { title: string }) =>
      window.api.notes.create({ title, body: '', bodyType: 'excalidraw' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notes.all });
    },
  });
}
