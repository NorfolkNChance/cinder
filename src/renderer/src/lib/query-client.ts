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

/**
 * Query keys — typed factories so invalidations and lookups can't drift.
 *
 * Convention: each domain has an `all` prefix that covers every cached
 * query in that domain, plus specific sub-keys for the operations the
 * domain exposes. Invalidating with the `all` array marks every key
 * sharing that prefix as stale.
 */
export const queryKeys = {
  notes: {
    all: ['notes'] as const,
    list: () => [...queryKeys.notes.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.notes.all, 'detail', id] as const,
  },
  projects: {
    all: ['projects'] as const,
    list: () => [...queryKeys.projects.all, 'list'] as const,
    detail: (id: string) =>
      [...queryKeys.projects.all, 'detail', id] as const,
  },
  tasks: {
    all: ['tasks'] as const,
    // Scope-keyed: structurally-equal scope objects map to the same cache
    // entry, so re-selecting the same project re-uses the cached list.
    list: (scope: object) => [...queryKeys.tasks.all, 'list', scope] as const,
    detail: (id: string) => [...queryKeys.tasks.all, 'detail', id] as const,
  },
  labels: {
    all: ['labels'] as const,
    list: () => [...queryKeys.labels.all, 'list'] as const,
  },
  savedFilters: {
    all: ['savedFilters'] as const,
    list: () => [...queryKeys.savedFilters.all, 'list'] as const,
  },
} as const;
