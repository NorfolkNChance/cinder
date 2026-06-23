import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * E2E for Draw mode (Excalidraw).
 *
 * Guards the security-sensitive integration: that the bundled Excalidraw editor
 * mounts under Cinder's CSP, loads its fonts from the self-hosted
 * `excalidraw-asset://` scheme (no CDN, no eval), and round-trips a drawing
 * through the notes DB as a `bodyType: 'excalidraw'` note.
 *
 * NOTE: Excalidraw eagerly fires its esm.sh CDN font *fallback* even when the
 * self-hosted primary works; those requests are CSP-blocked and harmless. We
 * assert on the things that matter (primary font loads, no eval) and tolerate
 * that fallback noise.
 */

async function getMainWindow(app: ElectronApplication, timeoutMs = 30_000): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const w of app.windows()) {
      const url = w.url();
      if (url && url.includes('index.html') && !url.includes('mode=capture')) return w;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Main window never appeared');
}

test('Draw mode: Excalidraw mounts under CSP, fonts self-host, drawing persists', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'cinder-draw-'));
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userData}`] });

  const evalErrors: string[] = [];
  const pageErrors: string[] = [];

  try {
    const page = await getMainWindow(app);
    page.on('console', (m) => {
      // Excalidraw's CDN font fallback is CSP-blocked and expected; ignore it.
      // Capture only genuine eval/wasm execution failures.
      const t = m.text();
      if (m.type() === 'error' && /EvalError|Refused to (evaluate|compile)|CompileError/i.test(t)) {
        evalErrors.push(t);
      }
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.waitForFunction(() => Boolean((window as Window & { api?: unknown }).api), null, { timeout: 30_000 });
    await page.waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, null, { timeout: 30_000 });

    // Enter Draw mode and create a drawing.
    await page.getByRole('button', { name: 'Draw' }).click();
    await page.getByRole('button', { name: '+ New drawing' }).click();

    // Excalidraw mounts a canvas.
    await page.waitForSelector('.excalidraw canvas', { timeout: 30_000 });
    expect(await page.locator('.excalidraw canvas').count()).toBeGreaterThan(0);

    // The asset path points at the self-hosted scheme, and the real font loads
    // through it (esm.sh is CSP-blocked, so a successful load proves local).
    const assetPath = await page.evaluate(
      () => (window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH,
    );
    expect(assetPath, 'asset path is self-hosted (not a CDN)').toMatch(/^excalidraw-asset:\/\/|^http:\/\/localhost/);

    const fontLoaded = await page.evaluate(async () => {
      try {
        const faces = await document.fonts.load('20px Excalifont');
        return faces.length > 0;
      } catch {
        return false;
      }
    });
    expect(fontLoaded, 'Excalifont loads from the self-hosted scheme').toBe(true);

    // A drawing was persisted as a bodyType:'excalidraw' note (drawingsOnly list).
    const drawings = await page.evaluate(() =>
      (window as unknown as {
        api: { notes: { list: (i: unknown) => Promise<{ bodyType: string }[]> } };
      }).api.notes.list({ drawingsOnly: true }),
    );
    expect(drawings.length, 'one drawing exists').toBeGreaterThan(0);
    expect(drawings.every((d) => d.bodyType === 'excalidraw')).toBe(true);

    // And it must NOT leak into the regular notes list.
    const regular = await page.evaluate(() =>
      (window as unknown as {
        api: { notes: { list: (i: unknown) => Promise<{ bodyType: string }[]> } };
      }).api.notes.list({}),
    );
    expect(regular.some((n) => n.bodyType === 'excalidraw'), 'drawings excluded from Notes list').toBe(false);

    expect(evalErrors, `no eval/wasm violations:\n${evalErrors.join('\n')}`).toEqual([]);
    expect(pageErrors, `no page errors:\n${pageErrors.join('\n')}`).toEqual([]);
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
});
