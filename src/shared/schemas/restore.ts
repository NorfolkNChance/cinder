import { z } from 'zod';

/**
 * Zod schemas for the restore domain.
 *
 * The entire restore flow runs in the main process behind native dialogs:
 * the renderer only pulls the trigger. No file paths and no key material
 * ever cross the IPC boundary — same posture as the export domain.
 */

/** Kick off the interactive restore-from-backup flow. No parameters. */
export const RestoreFromBackupInput = z.object({});
export type RestoreFromBackupInput = z.infer<typeof RestoreFromBackupInput>;

/**
 * Returned by `restore:fromBackup`.
 *
 *   success: true  → the swap happened; the app is about to relaunch, so
 *                    the renderer will usually never observe this value.
 *   success: false → nothing was changed; `reason` explains why
 *     'cancelled' → the user backed out at one of the dialogs
 *     'error'     → validation or I/O failed; `message` has details
 *                   (already shown to the user in a native dialog)
 */
export const RestoreResult = z.discriminatedUnion('success', [
  z.object({ success: z.literal(true) }),
  z.object({
    success: z.literal(false),
    reason: z.enum(['cancelled', 'error']),
    message: z.string().optional(),
  }),
]);
export type RestoreResult = z.infer<typeof RestoreResult>;
