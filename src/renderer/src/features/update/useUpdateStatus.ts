import { useState, useEffect } from 'react';
import type { UpdateStatus } from '../../../../shared/schemas/update';

const INITIAL: UpdateStatus = { phase: 'idle' };

/**
 * Subscribe to update status events pushed from the main process.
 *
 * Returns the current UpdateStatus. The subscription is set up once on
 * mount and torn down on unmount via the cleanup function returned by
 * `window.api.update.onStatus`.
 *
 * In development the main process never calls `initUpdater`, so this hook
 * simply stays in the 'idle' state forever — no stub needed.
 */
export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>(INITIAL);

  useEffect(() => {
    const off = window.api.update.onStatus(setStatus);
    return off;
  }, []);

  return status;
}
