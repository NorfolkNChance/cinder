import { QueryClient } from '@tanstack/react-query';

/**
 * The single QueryClient instance for the renderer.
 *
 * Defaults tuned for an Electron app: nothing to "refetch on window focus"
 * because we own both ends of the API — main pushes mutations through
 * cache invalidation, not polling.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
      // Cache is invalidated explicitly by mutations; without external
      // change sources we don't need a stale time policy beyond infinity.
      staleTime: Infinity,
    },
  },
});

/** Query keys — all notes queries hang off this so invalidation is trivial. */
export const queryKeys = {
  notes: {
    all: ['notes'] as const,
    list: () => [...queryKeys.notes.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.notes.all, 'detail', id] as const,
  },
} as const;
