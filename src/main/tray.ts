import {
  app,
  BrowserWindow,
  globalShortcut,
  nativeImage,
  screen,
  Tray,
} from 'electron';
import { join } from 'path';
import { deflateSync } from 'zlib';
import { is } from '@electron-toolkit/utils';
import { setCaptureWindow } from './ipc/capture';

// ── PNG icon generator ────────────────────────────────────────────────────────
// Build the tray icon at runtime — avoids needing a bundled image asset.
// The icon is a 22×22 RGBA PNG with a "+" shape (black on transparent),
// which macOS treats as a template image and tints for dark/light menu bars.

/** Standard CRC32 lookup table used by PNG chunk checksums. */
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i] ?? 0;
    const idx = (c ^ byte) & 0xff;
    c = (CRC_TABLE[idx] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) | 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Build a 22×22 RGBA PNG with a "+" shape (pencil-capture icon).
 * Black pixels on a transparent background — macOS recolours template images
 * automatically to suit the current menu-bar appearance.
 */
function buildTrayIconBuffer(): Buffer {
  const W = 22;
  const H = 22;
  const rows: Buffer[] = [];

  for (let y = 0; y < H; y++) {
    const row = Buffer.alloc(1 + W * 4); // filter byte + RGBA per pixel
    row[0] = 0; // filter method = None
    for (let x = 0; x < W; x++) {
      // Horizontal arm: rows 9–12, x 3–18
      // Vertical arm:   cols 9–12, y 3–18
      const filled =
        (y >= 9 && y <= 12 && x >= 3 && x <= 18) ||
        (x >= 9 && x <= 12 && y >= 3 && y <= 18);
      const i = 1 + x * 4;
      row[i] = 0;         // R
      row[i + 1] = 0;     // G
      row[i + 2] = 0;     // B
      row[i + 3] = filled ? 230 : 0; // A
    }
    rows.push(row);
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(W, 0);
  ihdrData.writeUInt32BE(H, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA (no palette, full alpha)
  // compression=0, filter=0, interlace=0 — already zeroed

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdrData),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Module state ──────────────────────────────────────────────────────────────

let tray: Tray | null = null;
let captureWin: BrowserWindow | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise the menu-bar tray icon and the quick-capture popup.
 *
 * Call once inside `app.whenReady()`, after IPC handlers and the main
 * window are set up — the capture window shares the preload and needs
 * the DB to be ready.
 *
 * The popup is created eagerly so it's pre-warmed and appears instantly
 * when the user first invokes it.
 */
export function initTray(): void {
  // Build and mark the icon as a macOS template image so the OS handles
  // dark/light menu-bar colouring automatically.
  const iconImg = nativeImage.createFromBuffer(buildTrayIconBuffer());
  iconImg.setTemplateImage(true);

  tray = new Tray(iconImg);
  tray.setToolTip('Cinder — Quick Capture (⌘⇧Space)');

  tray.on('click', () => {
    toggleCapture();
  });

  // Pre-warm the window so the first open is instant.
  getOrCreateCaptureWindow();

  // Global shortcut — works even when Cinder is in the background.
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    toggleCapture();
  });
}

/**
 * Unregister shortcuts and destroy the tray.
 * Call from `app.on('will-quit', ...)`.
 */
export function cleanupTray(): void {
  globalShortcut.unregister('CommandOrControl+Shift+Space');
  captureWin?.destroy();
  captureWin = null;
  tray?.destroy();
  tray = null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function getOrCreateCaptureWindow(): BrowserWindow {
  if (captureWin !== null && !captureWin.isDestroyed()) return captureWin;

  captureWin = new BrowserWindow({
    width: 440,
    height: 160,
    show: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    // Same hardened webPreferences as the main window — security is
    // non-negotiable even for utility windows.
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

  // Float above normal windows but below system overlays (e.g. Spotlight).
  captureWin.setAlwaysOnTop(true, 'floating');

  // Auto-dismiss when the user clicks elsewhere.
  captureWin.on('blur', () => {
    captureWin?.hide();
  });

  // Load the same renderer bundle with a query param that switches it to
  // capture mode instead of the full three-pane layout.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void captureWin.loadURL(
      `${process.env['ELECTRON_RENDERER_URL']}?mode=capture`,
    );
  } else {
    void captureWin.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { mode: 'capture' },
    });
  }

  // Give main the reference so the capture:hide IPC handler can close it.
  setCaptureWindow(captureWin);

  return captureWin;
}

function toggleCapture(): void {
  const win = getOrCreateCaptureWindow();
  if (win.isVisible()) {
    win.hide();
    return;
  }
  positionAndShow(win);
}

function positionAndShow(win: BrowserWindow): void {
  const trayBounds = tray?.getBounds();
  const { width: winW, height: winH } = win.getBounds();

  if (trayBounds !== undefined) {
    // Centre horizontally over the tray icon; appear just below the menu bar.
    const x = Math.round(trayBounds.x + trayBounds.width / 2 - winW / 2);
    const y = Math.round(trayBounds.y + trayBounds.height + 4);
    win.setPosition(x, y, false);
  } else {
    // Fallback: upper-centre of the primary display.
    const { width: dispW } = screen.getPrimaryDisplay().workAreaSize;
    win.setPosition(Math.round(dispW / 2 - winW / 2), Math.round(winH / 2), false);
  }

  win.show();
  win.focus();
}

// Prevent the app from quitting when the capture window is the last window
// open (it's a utility popup, not a primary window). The main window handles
// the macOS "reopen on activate" pattern.
app.on('before-quit', () => {
  // Mark the window as "ok to destroy" so the close event doesn't block quit.
  captureWin?.removeAllListeners('close');
});
