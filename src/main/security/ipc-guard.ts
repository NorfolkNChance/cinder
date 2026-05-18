import type { IpcMainInvokeEvent } from 'electron';

/**
 * Asserts that the IPC call originated from the main frame, not a subframe
 * or embedded content. Throws if the check fails so the handler can abort.
 */
export function assertMainFrame(event: IpcMainInvokeEvent): void {
  if (event.senderFrame?.url !== event.senderFrame?.top?.url) {
    throw new Error('IPC call from non-main frame rejected');
  }
}
