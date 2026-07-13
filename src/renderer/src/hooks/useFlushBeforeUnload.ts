import { useEffect } from 'react';

/**
 * Flush a pending debounced save when the window is about to unload.
 *
 * Closing the window (or quitting the app) destroys the renderer without
 * unmounting React, so unmount-time flushes never run and any edit still
 * inside its debounce delay is silently lost. The beforeunload listener
 * fires the pending save synchronously; the IPC message reaches the main
 * process before the renderer is torn down, so the write still lands.
 *
 * Pair this with the existing unmount/note-switch flush — it covers the
 * close/quit path only.
 */
export function useFlushBeforeUnload(debounced: { flush: () => void }): void {
  useEffect(() => {
    const flush = (): void => debounced.flush();
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [debounced]);
}
