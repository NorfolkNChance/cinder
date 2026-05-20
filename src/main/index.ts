import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { installCSP } from './security/csp';
import { openExternalSafe } from './security/open-external-safe';
import { initDb } from './db/index';
import { runMigrations } from './db/migrate';
import { initDrizzle } from './db/drizzle';
import { registerAppHandlers } from './ipc/app';
import { registerNotesHandlers } from './ipc/notes';
import { registerAttachmentsHandlers } from './ipc/attachments';
import { registerProjectsHandlers } from './ipc/projects';
import { registerSectionsHandlers } from './ipc/sections';
import { registerTasksHandlers } from './ipc/tasks';
import { registerLabelsHandlers } from './ipc/labels';
import { registerSavedFiltersHandlers } from './ipc/savedFilters';
import {
  registerAttachmentProtocol,
  registerAttachmentSchemePrivileges,
} from './protocol/attachment';

// Scheme privileges must be set BEFORE app.whenReady — Electron rejects
// late changes. See protocol/attachment.ts for the rationale.
registerAttachmentSchemePrivileges();

// Harden the app against remote module usage and navigation exploits
app.on('web-contents-created', (_event, contents) => {
  // Block all navigation away from the app origin
  contents.on('will-navigate', (event, url) => {
    const appUrl = is.dev
      ? process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173'
      : `file://${join(__dirname, '../renderer/index.html')}`;

    if (!url.startsWith(appUrl)) {
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

  // Block cross-origin redirects
  contents.on('will-redirect', (event, url) => {
    const appUrl = is.dev
      ? process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173'
      : `file://${join(__dirname, '../renderer/index.html')}`;

    if (!url.startsWith(appUrl)) {
      event.preventDefault();
    }
  });
});

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

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Block opening of new windows at the app level as a belt-and-suspenders measure
app.on('browser-window-created', (_event, window) => {
  // Prevent navigation via window.open in any popup that somehow slips through
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
});
