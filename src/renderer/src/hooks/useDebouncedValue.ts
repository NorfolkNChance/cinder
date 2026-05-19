import { useEffect, useState } from 'react';

/**
 * Returns a value that lags the input by `delay` milliseconds — updates
 * are coalesced so the consumer only sees the latest after the input
 * has stopped changing for the full delay.
 *
 * Used by the search input so we don't fire a new FTS5 query on every
 * keystroke. (useDebouncedCallback exists for the save case where we
 * want imperative flush() control; this one is for declarative
 * "give me the steady value" usage.)
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
