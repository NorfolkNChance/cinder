/**
 * Auto-update service — wraps electron-updater.
 *
 * Responsibilities:
 *   1. Configure autoUpdater once (logging, auto-download, feed URL).
 *   2. Push UpdateStatus events to the renderer via the BrowserWindow's
 *      webContents whenever the updater lifecycle advances.
 *   3. Expose `checkForUpdates()` and `quitAndInstall()` so the IPC handler
 *      can delegate to this service without importing electron-updater directly.
 *
 * Security notes:
 *   - Updates are downloaded over HTTPS (GitHub Releases) and verified against
 *     the code-signing signature embedded at build time. electron-updater
 *     rejects packages whose signature doesn't match before installation.
 *   - The renderer never receives a file path or binary — it only sees the
 *     UpdateStatus discriminated union. All privileged operations (download,
 *     install) are invoked from the trusted main process.
 *   - In development (is.dev) the updater is disabled to avoid spurious
 *     network requests and to protect against accidentally overwriting the
 *     running dev binary.
 *
 * Usage:
 *   Call `initUpdater(mainWindow)` once from `app.whenReady()`, after the
 *   BrowserWindow is created. Pass the window so the service can push status
 *   events to the renderer via webContents.send().
 */

import { type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { is } from '@electron-toolkit/utils';
import { UPDATE_STATUS } from '../../shared/ipc/channels';
import type { UpdateStatus } from '../../shared/schemas/update';

// ── Helpers ───────────────────────────────────────────────────────────────────

function push(win: BrowserWindow, status: UpdateStatus): void {
  // Guard against sending to a destroyed window (can happen if the user
  // closes the window between update events).
  if (!win.isDestroyed()) {
    win.webContents.send(UPDATE_STATUS, status);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initUpdater(win: BrowserWindow): void {
  // Never run the updater in dev — it would try to contact GitHub and
  // potentially mess with the local build artifacts.
  if (is.dev) return;

  // Download automatically in the background once an update is found.
  // The user is only prompted when the download is complete.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // ── Lifecycle events ────────────────────────────────────────────────────────

  autoUpdater.on('checking-for-update', () => {
    push(win, { phase: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    push(win, { phase: 'available', version: String(info.version) });
  });

  autoUpdater.on('update-not-available', () => {
    push(win, { phase: 'not-available' });
  });

  autoUpdater.on('download-progress', (progress) => {
    push(win, {
      phase: 'downloading',
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    push(win, { phase: 'ready', version: String(info.version) });
  });

  autoUpdater.on('error', (err: Error) => {
    push(win, { phase: 'error', message: err.message });
  });

  // Check automatically on startup, 10 seconds after the window is ready
  // (gives the app time to fully initialise before making network calls).
  setTimeout(() => {
    void autoUpdater.checkForUpdates();
  }, 10_000);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function checkForUpdates(): void {
  if (is.dev) return;
  void autoUpdater.checkForUpdates();
}

export function quitAndInstall(): void {
  if (is.dev) return;
  autoUpdater.quitAndInstall();
}
