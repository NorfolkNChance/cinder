import { ipcMain } from 'electron';
import { assertMainFrame } from '../security/ipc-guard';
import { RESTORE_FROM_BACKUP } from '../../shared/ipc/channels';
import { RestoreFromBackupInput } from '../../shared/schemas/restore';
import { restoreFromBackup } from '../services/restore';

/**
 * IPC handler for the restore domain.
 *
 * The renderer only pulls the trigger — file selection, key handling,
 * validation, and confirmation all happen in native dialogs in the main
 * process. On success the app relaunches, so the invoke promise typically
 * never resolves on the renderer side.
 */
export function registerRestoreHandlers(): void {
  ipcMain.handle(RESTORE_FROM_BACKUP, async (event, raw) => {
    assertMainFrame(event);
    RestoreFromBackupInput.parse(raw);
    return restoreFromBackup({ liveDbAvailable: true });
  });
}
