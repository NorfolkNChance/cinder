import { useEffect, useMemo, useRef } from 'react';

/**
 * Debounce a callback by `delay` ms. The returned function reschedules
 * each invocation; the underlying callback only runs once the function
 * has been idle for the full delay. `flush()` runs it immediately and
 * cancels any pending invocation; `cancel()` discards a pending one.
 *
 * Used by the editor for auto-save (500ms after last edit, but ⌘S or
 * note-switch can flush immediately).
 */
export function useDebouncedCallback<TArgs extends readonly unknown[]>(
  callback: (...args: TArgs) => void,
  delay: number,
): {
  call: (...args: TArgs) => void;
  flush: () => void;
  cancel: () => void;
} {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgsRef = useRef<TArgs | null>(null);

  // Always invoke the latest callback. Avoids stale closures when the
  // editor's onUpdate captures changing state.
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useMemo(() => {
    const cancel = (): void => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingArgsRef.current = null;
    };

    const flush = (): void => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const args = pendingArgsRef.current;
      pendingArgsRef.current = null;
      if (args !== null) {
        callbackRef.current(...args);
      }
    };

    const call = (...args: TArgs): void => {
      pendingArgsRef.current = args;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingArgsRef.current;
        pendingArgsRef.current = null;
        if (pending !== null) {
          callbackRef.current(...pending);
        }
      }, delay);
    };

    return { call, flush, cancel };
  }, [delay]);
}
