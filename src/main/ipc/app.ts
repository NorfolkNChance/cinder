import { app, ipcMain } from 'electron';
import { z } from 'zod';
import { assertMainFrame } from '../security/ipc-guard';
import { openExternalSafe } from '../security/open-external-safe';
import { APP_GET_VERSION, APP_OPEN_EXTERNAL } from '../../shared/ipc/channels';

const OpenExternalInput = z.object({ url: z.string().url() });

export function registerAppHandlers(): void {
  ipcMain.handle(APP_GET_VERSION, (event) => {
    assertMainFrame(event);
    return app.getVersion();
  });

  ipcMain.handle(APP_OPEN_EXTERNAL, async (event, raw) => {
    assertMainFrame(event);
    const { url } = OpenExternalInput.parse(raw);
    await openExternalSafe(url);
  });
}
