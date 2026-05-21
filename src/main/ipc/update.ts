import { ipcMain } from 'electron';
import { assertMainFrame } from '../security/ipc-guard';
import { UPDATE_CHECK, UPDATE_INSTALL } from '../../shared/ipc/channels';
import { checkForUpdates, quitAndInstall } from '../services/updater';

/**
 * Register handlers for the renderer-initiated update actions.
 *
 * The status push channel (UPDATE_STATUS) runs in the opposite direction
 * (main → renderer via webContents.send) and is set up in updater.ts when
 * `initUpdater()` is called with the BrowserWindow reference.
 */
export function registerUpdateHandlers(): void {
  ipcMain.handle(UPDATE_CHECK, (event) => {
    assertMainFrame(event);
    checkForUpdates();
  });

  ipcMain.handle(UPDATE_INSTALL, (event) => {
    assertMainFrame(event);
    quitAndInstall();
  });
}
