import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * E2E for embedding a drawing into a note (Phase 2).
 *
 * Exercises the security-sensitive export path: a drawing is rendered to PNG via
 * Excalidraw's canvas raster export (which must stay off the harfbuzz/eval font-
 * subsetting path), saved as an attachment, and inserted into the note as an
 * image. Asserts the image lands with an attachment:// src and no eval occurs.
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

test('Insert a drawing into a note as an attachment image, no eval', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'cinder-embed-'));
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userData}`] });

  const evalErrors: string[] = [];
  const pageErrors: string[] = [];

  try {
    const page = await getMainWindow(app);
    page.on('console', (m) => {
      const t = m.text();
      if (m.type() === 'error' && /EvalError|Refused to (evaluate|compile)|CompileError/i.test(t)) {
        evalErrors.push(t);
      }
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.waitForFunction(() => Boolean((window as Window & { api?: unknown }).api), null, { timeout: 30_000 });
    await page.waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, null, { timeout: 30_000 });

    // Create a note (opens it in the editor; selection persists across modes).
    await page.getByRole('button', { name: '+ New', exact: true }).click();
    await page.waitForSelector('#tiptap-editor-content');

    // Create a drawing via the UI (so the drawings list invalidates and the
    // InsertDrawing dropdown sees it).
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await page.getByRole('button', { name: '+ New drawing', exact: true }).click();
    await page.waitForSelector('.excalidraw canvas');

    // Back to the note. Switching away unmounts the drawing editor (which would
    // otherwise autosave its empty scene), so we seed the rectangle scene via
    // IPC AFTER the switch — making our write the last one before insert.
    // Deterministic, no flaky canvas mouse work.
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.waitForSelector('#tiptap-editor-content');
    await page.waitForTimeout(500);

    await page.evaluate(async () => {
      const api = (window as unknown as {
        api: {
          notes: {
            list: (i: unknown) => Promise<{ id: string }[]>;
            update: (i: unknown) => Promise<unknown>;
          };
        };
      }).api;
      const [drawing] = await api.notes.list({ drawingsOnly: true });
      const scene = {
        type: 'excalidraw',
        version: 2,
        source: 'cinder',
        elements: [
          {
            id: 'rect-1', type: 'rectangle', x: 100, y: 100, width: 220, height: 140,
            angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent',
            fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 1,
            opacity: 100, groupIds: [], frameId: null, index: 'a0',
            roundness: { type: 3 }, seed: 1, version: 1, versionNonce: 1,
            isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
          },
        ],
        appState: { viewBackgroundColor: '#ffffff' },
        files: {},
      };
      await api.notes.update({ id: drawing!.id, patch: { body: JSON.stringify(scene) } });
    });

    await page.getByRole('button', { name: 'Insert drawing' }).click();
    await page.getByRole('menuitem', { name: /Untitled drawing/ }).click();

    // The image lands in the editor with an attachment:// source.
    await page.waitForSelector('#tiptap-editor-content img[src^="attachment://"]', { timeout: 15_000 });
    const imgSrc = await page.getAttribute('#tiptap-editor-content img[src^="attachment://"]', 'src');
    expect(imgSrc, 'inserted image has an attachment:// src').toMatch(/^attachment:\/\//);

    // The image actually rendered — the attachment protocol served real PNG
    // bytes to the <img> (naturalWidth > 0 proves a decoded, non-empty image).
    const imgOk = await page.evaluate(async () => {
      const img = document.querySelector(
        '#tiptap-editor-content img[src^="attachment://"]',
      ) as HTMLImageElement | null;
      if (!img) return false;
      try {
        await img.decode();
      } catch {
        /* fall through to naturalWidth check */
      }
      return img.naturalWidth > 0;
    });
    expect(imgOk, 'inserted drawing renders as a real PNG (protocol served bytes)').toBe(true);

    expect(evalErrors, `no eval/wasm violations during export:\n${evalErrors.join('\n')}`).toEqual([]);
    expect(pageErrors, `no page errors:\n${pageErrors.join('\n')}`).toEqual([]);
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
});
