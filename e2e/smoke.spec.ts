import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Unattended smoke test for the packaged-style Electron app.
 *
 * Launches the *built* main bundle (`out/main/index.js`) on the project's
 * pinned Electron, pointed at a throwaway `userData` dir so it never touches
 * real notes or the real Keychain DB key. Verifies the things that matter most
 * after an Electron/native-module bump (and that unit tests can't catch):
 *
 *   1. the main process boots without crashing,
 *   2. the SQLCipher native binding loads and `initDb()` succeeds at runtime
 *      (the v1.2.4 crash was a missing binding — see ADR-0005),
 *   3. the renderer mounts under the bundled Chromium,
 *   4. a real IPC -> DB round-trip works end to end (create a note, read it back),
 *   5. settings load,
 *   6. no fatal renderer console / page errors.
 *
 * Run with `npm run smoke` (which builds first). A GUI window appears briefly;
 * "unattended" means no interaction is required, not that nothing is shown.
 */

// The app pre-warms a hidden `?mode=capture` window (menu-bar quick capture),
// so firstWindow() is not reliably the main window. Select by URL instead.
async function getMainWindow(app: ElectronApplication, timeoutMs = 30_000): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const w of app.windows()) {
      const url = w.url();
      if (url && url.includes('index.html') && !url.includes('mode=capture')) return w;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Main window (index.html without ?mode=capture) never appeared');
}

test('app boots, renderer mounts, and a notes IPC round-trip hits the DB', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'cinder-smoke-'));
  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${userData}`],
  });

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  try {
    const page = await getMainWindow(app);
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));

    // 1 + 2: preload bridge exposed (proves the app booted far enough to wire
    // contextBridge, which only happens after initDb succeeds).
    await page.waitForFunction(() => Boolean((window as Window & { api?: unknown }).api), null, {
      timeout: 30_000,
    });

    // 3: React app actually rendered something into #root.
    await page.waitForFunction(
      () => (document.getElementById('root')?.childElementCount ?? 0) > 0,
      null,
      { timeout: 30_000 },
    );

    // 4: end-to-end IPC -> SQLCipher write + read.
    const title = `smoke-${Date.now()}`;
    const created = await page.evaluate(
      (t) => (window as unknown as { api: { notes: { create: (i: unknown) => Promise<{ id: string }> } } })
        .api.notes.create({ title: t, body: 'smoke' }),
      title,
    );
    expect(created?.id, 'notes.create should return a row with an id').toBeTruthy();

    const titles = await page.evaluate(() =>
      (window as unknown as { api: { notes: { list: (i: unknown) => Promise<{ title: string }[]> } } })
        .api.notes.list({}).then((rows) => rows.map((r) => r.title)),
    );
    expect(titles, 'created note should come back from notes.list').toContain(title);

    // 5: settings read path works.
    const settings = await page.evaluate(() =>
      (window as unknown as { api: { settings: { getAll: () => Promise<unknown> } } }).api.settings.getAll(),
    );
    expect(settings, 'settings.getAll should resolve').toBeTruthy();

    // 6: no fatal renderer errors. Filter known-benign noise (the unpackaged
    // dev CSP warning, DevTools/autofill chatter).
    expect(pageErrors, `unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    const fatalConsole = consoleErrors.filter(
      (e) => !/Content-Security-Policy|Autofill|DevTools|Electron Security Warning/i.test(e),
    );
    expect(fatalConsole, `unexpected console errors:\n${fatalConsole.join('\n')}`).toEqual([]);
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
});
