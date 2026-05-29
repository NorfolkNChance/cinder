/**
 * Minimal Electron stub for the vitest environment (plain Node.js, no binary).
 *
 * Vitest runs tests outside Electron. Any main-process module that does
 * `import { app } from 'electron'` would otherwise cause vitest to evaluate
 * the real electron npm-package entrypoint, which throws
 * "Electron failed to install correctly" when the binary is absent (CI).
 *
 * The alias in vitest.config.ts redirects `electron` here instead. Only the
 * surface area actually imported by the test dependency chains is stubbed;
 * tests that need specific return values should override these with vi.mock()
 * or vi.spyOn() inside the test file itself.
 */

export const app = {
  getPath: (_name: string) => `/tmp/cinder-test`,
  getVersion: () => '0.0.0-test',
  exit: (_code?: number) => { /* no-op */ },
  quit: () => { /* no-op */ },
  on: () => { /* no-op */ },
  whenReady: () => Promise.resolve(),
  isReady: () => true,
};

export const dialog = {
  showSaveDialog: () => Promise.resolve({ canceled: true, filePath: undefined }),
  showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
  showMessageBox: () => Promise.resolve({ response: 0, checkboxChecked: false }),
  showErrorBox: (_title: string, _content: string) => { /* no-op */ },
};

export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (str: string) => Buffer.from(str, 'utf-8'),
  decryptString: (buf: Buffer) => buf.toString('utf-8'),
};

export const ipcMain = {
  handle: () => { /* no-op */ },
  on: () => { /* no-op */ },
  off: () => { /* no-op */ },
  removeHandler: () => { /* no-op */ },
};

export const ipcRenderer = {
  invoke: () => Promise.resolve(),
  on: () => { /* no-op */ },
  off: () => { /* no-op */ },
  send: () => { /* no-op */ },
};

export const contextBridge = {
  exposeInMainWorld: () => { /* no-op */ },
};

export const session = {
  defaultSession: {
    webRequest: {
      onHeadersReceived: () => { /* no-op */ },
    },
  },
};

export const shell = {
  openExternal: () => Promise.resolve(),
};

export const globalShortcut = {
  register: () => true,
  unregister: () => { /* no-op */ },
  unregisterAll: () => { /* no-op */ },
  isRegistered: () => false,
};

export const Notification = class {
  show() { /* no-op */ }
  static isSupported() { return false; }
};

export const BrowserWindow = class {
  loadURL() { return Promise.resolve(); }
  loadFile() { return Promise.resolve(); }
  show() { /* no-op */ }
  on() { /* no-op */ }
  webContents = { send: () => { /* no-op */ }, openDevTools: () => { /* no-op */ }, on: () => { /* no-op */ }, setWindowOpenHandler: () => { /* no-op */ } };
  static getAllWindows() { return []; }
};

export const Tray = class {
  setToolTip() { /* no-op */ }
  setContextMenu() { /* no-op */ }
  on() { /* no-op */ }
  setImage() { /* no-op */ }
};

export const Menu = {
  buildFromTemplate: () => ({}),
  setApplicationMenu: () => { /* no-op */ },
};

export const nativeImage = {
  createEmpty: () => ({}),
  createFromBuffer: () => ({}),
};

export const is = {
  dev: false,
  mac: true,
  windows: false,
  linux: false,
};
