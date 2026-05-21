import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AppSettings, SettingKey } from '../../../../shared/schemas/settings';

const QUERY_KEY = ['settings'] as const;

/**
 * Load all settings from the main process.
 *
 * The result is cached by TanStack Query (stale-time: Infinity — settings
 * only change when the user explicitly changes them in this session). The
 * `set` helper invalidates the cache after every successful write so the
 * next read is fresh.
 */
export function useSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<AppSettings>({
    queryKey: QUERY_KEY,
    queryFn: () => window.api.settings.getAll(),
    staleTime: Infinity,
  });

  const mutation = useMutation<AppSettings, Error, { key: SettingKey; value: unknown }>({
    mutationFn: ({ key, value }) =>
      window.api.settings.set({ key, value }),
    onSuccess: (updated) => {
      queryClient.setQueryData<AppSettings>(QUERY_KEY, updated);
    },
  });

  const set = useCallback(
    <K extends SettingKey>(key: K, value: AppSettings[K]) => {
      mutation.mutate({ key, value });
    },
    [mutation],
  );

  return { settings, isLoading, set };
}
