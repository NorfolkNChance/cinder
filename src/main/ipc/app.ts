import { app, ipcMain } from 'electron';
import { assertMainFrame } from '../security/ipc-guard';
import { APP_GET_VERSION } from '../../shared/ipc/channels';

export function registerAppHandlers(): void {
  ipcMain.handle(APP_GET_VERSION, (event) => {
    assertMainFrame(event);
    return app.getVersion();
  });
}
