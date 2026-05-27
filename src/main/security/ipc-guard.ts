import type { IpcMainInvokeEvent } from 'electron';

/**
 * Asserts that the IPC call originated from the main frame, not a subframe
 * or embedded content. Throws if the check fails so the handler can abort.
 *
 * Uses reference identity (`senderFrame === senderFrame.top`) rather than
 * URL equality. URL equality has two failure modes:
 *   1. If `senderFrame` is destroyed mid-call, both sides are `undefined`
 *      and `undefined !== undefined` is `false` — the guard silently passes.
 *   2. A subframe loaded from the same URL as the top frame also passes.
 * Reference identity avoids both: a null check gates on frame existence,
 * and identity comparison is unforgeable regardless of URL.
 */
export function assertMainFrame(event: IpcMainInvokeEvent): void {
  if (!event.senderFrame || event.senderFrame !== event.senderFrame.top) {
    throw new Error('IPC call from non-main frame rejected');
  }
}
