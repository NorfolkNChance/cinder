import { z } from 'zod';

/**
 * Update lifecycle phases pushed from the main process to the renderer.
 *
 *   idle          → initial state; no check started yet
 *   checking      → autoUpdater.checkForUpdates() in flight
 *   available     → a newer version exists; download starting automatically
 *   not-available → already on the latest version
 *   downloading   → update binary in progress (percent 0-100)
 *   ready         → downloaded and verified; safe to quit-and-install
 *   error         → something went wrong; message has details
 */
export const UpdateStatus = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('idle') }),
  z.object({ phase: z.literal('checking') }),
  z.object({ phase: z.literal('available'), version: z.string() }),
  z.object({ phase: z.literal('not-available') }),
  z.object({
    phase: z.literal('downloading'),
    percent: z.number().min(0).max(100),
  }),
  z.object({ phase: z.literal('ready'), version: z.string() }),
  z.object({ phase: z.literal('error'), message: z.string() }),
]);

export type UpdateStatus = z.infer<typeof UpdateStatus>;
