/**
 * Self-host Excalidraw's runtime assets (fonts + locales).
 *
 * Excalidraw lazily fetches its fonts, locale JSON, and font-subsetting
 * worker from `window.EXCALIDRAW_ASSET_PATH` (default: the unpkg CDN). A
 * local-first, strict-CSP app cannot reach a CDN — and we don't want a
 * network dependency at all — so we copy the prebuilt `dist/prod` assets
 * into the renderer's public dir, where Vite serves them from our own
 * origin ('self') in dev and bundles them into out/renderer for prod.
 *
 * Run before `dev` / `build`. Output dir is gitignored.
 */
import { cp, rm, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/@excalidraw/excalidraw/dist/prod');
const dest = join(root, 'src/renderer/public/excalidraw-assets');

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });

// fonts/ and locales/ are fetched at runtime by code path; the worker +
// shared chunks are spawned as a module Worker for font subsetting.
//
// Skip the CJK font (Xiaolai, ~12 MB — 95% of the font payload): Excalidraw
// eagerly preloads it through its esm.sh CDN fallback, NOT through
// EXCALIDRAW_ASSET_PATH, so the local copy is never actually used (verified:
// those requests hit esm.sh and are CSP-blocked whether or not we ship it).
// Shipping it is dead weight; without it, CJK text in a drawing falls back to a
// system font — fine for a sketch tool.
const SKIP = new Set(['Xiaolai']);

for (const entry of [
  'fonts',
  'locales',
  'subset-worker.chunk.js',
  'subset-shared.chunk.js',
]) {
  await cp(join(src, entry), join(dest, entry), {
    recursive: true,
    filter: (s) => !s.split(/[\\/]/).some((seg) => SKIP.has(seg)),
  });
}

console.log(`[excalidraw] assets copied → ${dest}`);
