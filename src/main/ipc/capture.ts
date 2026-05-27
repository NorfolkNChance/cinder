import { ipcMain, type BrowserWindow } from 'electron';
import { CAPTURE_HIDE } from '../../shared/ipc/channels';
import { assertMainFrame } from '../security/ipc-guard';

/**
 * Reference to the capture popup window — set by initTray() once the
 * window is created. May be null before first toggle or after destroy.
 */
let captureWindow: BrowserWindow | null = null;

/** Called by tray.ts once the capture window is ready. */
export function setCaptureWindow(win: BrowserWindow): void {
  captureWindow = win;
}

/**
 * Registers the capture:hide IPC channel.
 *
 * The renderer inside the capture window calls this to dismiss itself —
 * it cannot close its own window directly (sandboxed renderer has no
 * direct access to BrowserWindow), so it delegates back to main.
 */
export function registerCaptureHandlers(): void {
  ipcMain.handle(CAPTURE_HIDE, (event) => {
    assertMainFrame(event);
    captureWindow?.hide();
  });
}
