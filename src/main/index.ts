import { app, BrowserWindow, dialog } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { installCSP } from './security/csp';
import { openExternalSafe } from './security/open-external-safe';
import { initDb, runIntegrityCheck } from './db/index';
import { runMigrations } from './db/migrate';
import { initDrizzle } from './db/drizzle';
import { runAutoBackup } from './services/export';
import { registerAppHandlers } from './ipc/app';
import { registerNotesHandlers } from './ipc/notes';
import { registerAttachmentsHandlers } from './ipc/attachments';
import { registerProjectsHandlers } from './ipc/projects';
import { registerSectionsHandlers } from './ipc/sections';
import { registerTasksHandlers } from './ipc/tasks';
import { registerLabelsHandlers } from './ipc/labels';
import { registerSavedFiltersHandlers } from './ipc/savedFilters';
import { registerExportHandlers } from './ipc/export';
import { registerSettingsHandlers } from './ipc/settings';
import { registerUpdateHandlers } from './ipc/update';
import { registerCaptureHandlers } from './ipc/capture';
import { registerVaultHandlers } from './ipc/vault';
import { initTray, cleanupTray } from './tray';
import { initUpdater } from './services/updater';
import { initNotifier, cleanupNotifier } from './services/notifier';
import {
  registerAttachmentProtocol,
  registerAttachmentSchemePrivileges,
} from './protocol/attachment';

// Scheme privileges must be set BEFORE app.whenReady — Electron rejects
// late changes. See protocol/attachment.ts for the rationale.
registerAttachmentSchemePrivileges();

/**
 * Return the canonical app URL for the current environment.
 *
 * In dev:  the Vite dev-server origin (e.g. http://localhost:5173)
 * In prod: the exact file:// URL of the bundled index.html
 */
function getAppUrl(): string {
  return is.dev
    ? process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173'
    : `file://${join(__dirname, '../renderer/index.html')}`;
}

/**
 * Returns true when `url` is a safe navigation target for the app.
 *
 * Uses the URL API rather than string prefix matching to prevent the
 * basic-auth bypass: `http://localhost:5173@evil.com` passes a naive
 * startsWith check but has origin `http://evil.com`.
 *
 * - Dev:  allow any path under the same origin (Vite HMR may add paths).
 * - Prod: allow only the exact file:// href of index.html (no navigation
 *         should ever happen in a production SPA served from a file).
 * - Any URL that fails to parse is blocked.
 */
function isAllowedNavigation(url: string): boolean {
  const appUrl = getAppUrl();
  try {
    const dest = new URL(url);
    const allowed = new URL(appUrl);

    if (is.dev) {
      // Compare origins. For http:// URLs, origin includes protocol + host + port.
      return dest.origin === allowed.origin;
    } else {
      // file:// URLs have origin === 'null' (string), so compare full href.
      return dest.href === allowed.href;
    }
  } catch {
    // Unparseable URL — block it.
    return false;
  }
}

// Harden the app against remote module usage and navigation exploits
app.on('web-contents-created', (_event, contents) => {
  // Block all navigation away from the app origin.
  // Uses URL API origin comparison to prevent the basic-auth bypass
  // (e.g. http://localhost:5173@evil.com passes startsWith but is evil.com).
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
    }
  });

  // Block new window creation; route https links to the OS browser safely
  contents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url).catch((err: unknown) => {
      console.error('openExternalSafe rejected:', err);
    });
    return { action: 'deny' };
  });

  // Unconditionally deny webview attachment
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  // Block cross-origin redirects — same logic as will-navigate.
  contents.on('will-redirect', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
    }
  });
});

/**
 * Current main window reference. Updated whenever a new window is created
 * so that long-lived services (notifier) always resolve the right instance.
 */
let mainWindowRef: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      enableBlinkFeatures: '',
      webviewTag: false,
      preload: join(__dirname, '../preload/index.js'),
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (is.dev) {
    mainWindow.webContents.openDevTools();
  }

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

app.whenReady().then(async () => {
  // Install CSP headers before any content loads
  installCSP();

  // Wire the attachment:// file-serving handler now that the app is ready.
  registerAttachmentProtocol();

  // Initialise the encrypted database, apply any pending schema migrations,
  // and wire the Drizzle query layer. All three must complete before IPC
  // handlers start fielding requests that touch the DB.
  await initDb();
  await runMigrations();

  // Integrity check — runs after migrations so the schema is always current.
  // A fresh database always passes; a corrupt one surfaces here before the
  // user starts writing more data into it.
  const dbOk = await runIntegrityCheck();
  if (!dbOk) {
    const { response } = await dialog.showMessageBox({
      type: 'error',
      title: 'Database Problem Detected',
      message: 'Cinder found a problem in your database.',
      detail:
        'Some data may be corrupted. Continuing may make things worse.\n\n' +
        'Auto-backups (if enabled) are stored at:\n' +
        `${app.getPath('userData')}/backups/\n\n` +
        'Restore from a backup, then relaunch. If you have no backup, ' +
        'you can continue but data loss is possible.',
      buttons: ['Quit (recommended)', 'Continue anyway'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      app.exit(1);
    }
  }

  initDrizzle();

  // Register IPC handlers
  registerAppHandlers();
  registerNotesHandlers();
  registerAttachmentsHandlers();
  registerProjectsHandlers();
  registerSectionsHandlers();
  registerTasksHandlers();
  registerLabelsHandlers();
  registerSavedFiltersHandlers();
  registerExportHandlers();
  registerSettingsHandlers();
  registerUpdateHandlers();
  registerCaptureHandlers();
  registerVaultHandlers();

  mainWindowRef = createWindow();
  initTray();
  initUpdater(mainWindowRef);
  initNotifier(() => mainWindowRef);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindowRef = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Guard against re-entering the will-quit handler when app.quit() is called
// from within the async auto-backup flow.
let _quitting = false;

app.on('will-quit', (event) => {
  if (_quitting) return; // second pass — let it proceed

  event.preventDefault();
  _quitting = true;

  void (async () => {
    try {
      await runAutoBackup();
    } catch (err) {
      // Auto-backup failures are logged but must never prevent the app
      // from quitting — the user's intent to quit takes priority.
      console.error('[cinder] Auto-backup on quit failed:', err);
    } finally {
      cleanupNotifier();
      cleanupTray();
      app.quit();
    }
  })();
});

// Block opening of new windows at the app level as a belt-and-suspenders measure
app.on('browser-window-created', (_event, window) => {
  // Prevent navigation via window.open in any popup that somehow slips through
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
});
