import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * E2E for self-contained markdown export.
 *
 * A note containing a live drawing embed (drawing://) and a static attachment
 * image (attachment://) is exported; the resulting .md must inline both as
 * data: URIs so it is portable outside Cinder — no app-only references remain.
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

test('export inlines drawing:// and attachment:// images as data URIs', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'cinder-export-'));
  const outMd = join(mkdtempSync(join(tmpdir(), 'cinder-out-')), 'note.md');
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userData}`] });

  try {
    const page = await getMainWindow(app);
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForFunction(() => Boolean((window as Window & { api?: unknown }).api), null, { timeout: 30_000 });
    await page.waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, null, { timeout: 30_000 });

    // The app lands on Summary (full-width, no sidebar) — switch to Notes first.
    await page.getByRole('button', { name: 'Notes', exact: true }).click();

    // A note to export into.
    await page.getByRole('button', { name: '+ New', exact: true }).click();
    await page.waitForSelector('#tiptap-editor-content');

    // A drawing with content (drawn through the app so caches stay correct).
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await page.getByRole('button', { name: '+ New drawing', exact: true }).click();
    await page.waitForSelector('.excalidraw canvas');
    const box = await page.locator('.excalidraw canvas').first().boundingBox();
    if (!box) throw new Error('no canvas box');
    await page.getByTitle(/Rectangle/i).first().click();
    await page.mouse.move(box.x + 220, box.y + 160);
    await page.mouse.down();
    await page.mouse.move(box.x + 440, box.y + 320, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(1500);

    // Back to the note; insert one live embed and one snapshot.
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.waitForSelector('#tiptap-editor-content');

    // Live embed (default mode) → drawing://
    await page.getByRole('button', { name: 'Insert drawing' }).click();
    await page.getByRole('menuitem', { name: /Untitled drawing/ }).click();
    await page.waitForTimeout(500);

    // Snapshot → attachment://
    await page.getByRole('button', { name: 'Insert drawing' }).click();
    await page.getByRole('button', { name: 'snapshot', exact: true }).click();
    await page.getByRole('menuitem', { name: /Untitled drawing/ }).click();
    // Wait for both images to be present and the note to autosave.
    await expect.poll(async () => page.locator('#tiptap-editor-content img').count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
    await page.waitForTimeout(1000);

    // Sanity: the stored body holds both app-only references before export.
    const storedBody = await page.evaluate(() =>
      (window as unknown as { api: { notes: { list: (i: unknown) => Promise<{ body: string }[]> } } })
        .api.notes.list({}).then((r) => r.map((n) => n.body).join('\n')),
    );
    expect(storedBody).toMatch(/drawing:\/\//);
    expect(storedBody).toMatch(/attachment:\/\//);

    // Stub the native Save dialog to write to our temp path, then export.
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = () =>
        Promise.resolve({ canceled: false, filePath: p } as Electron.SaveDialogReturnValue);
    }, outMd);

    await page.getByRole('button', { name: 'Export options' }).click();
    // "This note" row → Markdown format pill.
    await page.getByRole('menuitem', { name: 'Export This note as MD' }).click();

    // The written file is self-contained: data URIs, no app-only refs.
    await expect.poll(() => {
      try { return readFileSync(outMd, 'utf-8'); } catch { return ''; }
    }, { timeout: 10_000 }).toMatch(/data:image\/png;base64,/);

    const md = readFileSync(outMd, 'utf-8');
    expect(md, 'no live drawing refs remain').not.toMatch(/drawing:\/\//);
    expect(md, 'no attachment refs remain').not.toMatch(/attachment:\/\//);
    // Two images → two inlined data URIs.
    expect((md.match(/data:image\/png;base64,/g) ?? []).length).toBeGreaterThanOrEqual(2);
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
    rmSync(join(outMd, '..'), { recursive: true, force: true });
  }
});
