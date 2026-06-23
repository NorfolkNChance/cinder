import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * E2E for LIVE drawing embeds (Phase 3).
 *
 * A live embed is an image node with a `drawing://<id>` src, rendered by a
 * React NodeView that rasterizes the drawing's current scene. Asserts:
 *   - inserting a live embed renders the drawing as an image (no eval),
 *   - the note's markdown carries the durable `drawing://<id>` reference,
 *   - double-clicking the embed opens the drawing in Draw mode.
 *
 * Content is drawn through the app (canvas → autosave → query invalidation) so
 * the embed's cached view of the drawing is correct — a raw IPC seed wouldn't
 * invalidate the renderer cache (staleTime is Infinity).
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

test('live drawing embed renders, stores a drawing:// ref, and opens on double-click', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'cinder-live-'));
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userData}`] });

  const evalErrors: string[] = [];
  const pageErrors: string[] = [];

  try {
    const page = await getMainWindow(app);
    await page.setViewportSize({ width: 1200, height: 800 });
    page.on('console', (m) => {
      const t = m.text();
      if (m.type() === 'error' && /EvalError|Refused to (evaluate|compile)|CompileError/i.test(t)) {
        evalErrors.push(t);
      }
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.waitForFunction(() => Boolean((window as Window & { api?: unknown }).api), null, { timeout: 30_000 });
    await page.waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, null, { timeout: 30_000 });

    // A note to embed into.
    await page.getByRole('button', { name: '+ New', exact: true }).click();
    await page.waitForSelector('#tiptap-editor-content');

    // A drawing with one element, drawn through the app so caches stay correct.
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await page.getByRole('button', { name: '+ New drawing', exact: true }).click();
    await page.waitForSelector('.excalidraw canvas');
    const box = await page.locator('.excalidraw canvas').first().boundingBox();
    if (!box) throw new Error('no canvas box');
    // Select the rectangle tool from Excalidraw's toolbar, then drag on canvas.
    await page.getByTitle(/Rectangle/i).first().click();
    await page.mouse.move(box.x + 220, box.y + 160);
    await page.mouse.down();
    await page.mouse.move(box.x + 440, box.y + 320, { steps: 10 });
    await page.mouse.up();
    // Let the debounced autosave persist + invalidate the drawing query.
    await page.waitForTimeout(1500);

    // Confirm the drawing actually has an element (guards the canvas interaction).
    const elementCount = await page.evaluate(() =>
      (window as unknown as { api: { notes: { list: (i: unknown) => Promise<{ body: string }[]> } } })
        .api.notes.list({ drawingsOnly: true })
        .then((rows) => {
          try {
            return (JSON.parse(rows[0]!.body).elements ?? []).length;
          } catch {
            return 0;
          }
        }),
    );
    expect(elementCount, 'the drawing has at least one element').toBeGreaterThan(0);

    // Back to the note; insert a LIVE embed (default mode).
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.waitForSelector('#tiptap-editor-content');
    await page.getByRole('button', { name: 'Insert drawing' }).click();
    await page.getByRole('menuitem', { name: /Untitled drawing/ }).click();

    // The NodeView renders the drawing as a real image.
    await page.waitForSelector('#tiptap-editor-content img', { timeout: 15_000 });
    const rendered = await page.evaluate(async () => {
      const img = document.querySelector('#tiptap-editor-content img') as HTMLImageElement | null;
      if (!img) return false;
      try { await img.decode(); } catch { /* fall through */ }
      return img.naturalWidth > 0;
    });
    expect(rendered, 'live embed rasterizes the drawing to a visible image').toBe(true);

    // The markdown stores the durable drawing:// reference (not a blob/attachment).
    // Poll because the editor autosaves on a 500ms debounce after the insert.
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            (window as unknown as { api: { notes: { list: (i: unknown) => Promise<{ body: string }[]> } } })
              .api.notes.list({}).then((rows) => rows.map((r) => r.body).join('\n')),
          ),
        { timeout: 5000 },
      )
      .toMatch(/drawing:\/\/[0-9a-f-]+/);

    // Double-clicking the embed opens the drawing in Draw mode.
    await page.locator('#tiptap-editor-content img').first().dblclick();
    await page.waitForSelector('.excalidraw canvas', { timeout: 10_000 });
    const inDrawMode = await page.evaluate(
      () => document.querySelector('.excalidraw') !== null,
    );
    expect(inDrawMode, 'double-click opened the drawing in Draw mode').toBe(true);

    expect(evalErrors, `no eval/wasm violations:\n${evalErrors.join('\n')}`).toEqual([]);
    expect(pageErrors, `no page errors:\n${pageErrors.join('\n')}`).toEqual([]);
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
});
