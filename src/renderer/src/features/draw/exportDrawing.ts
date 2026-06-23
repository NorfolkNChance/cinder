import { exportToBlob } from '@excalidraw/excalidraw';
import type {
  ExcalidrawInitialDataState,
  BinaryFiles,
} from '@excalidraw/excalidraw/types';
import type { NonDeletedExcalidrawElement } from '@excalidraw/excalidraw/element/types';

/**
 * Render a drawing scene (the `body` of an excalidraw note) to PNG bytes.
 *
 * Uses Excalidraw's standalone `exportToBlob` — a canvas raster, which renders
 * text with the already-loaded FontFaces and does NOT inline/subset fonts.
 * That matters for security: font subsetting is the only harfbuzz/WASM path in
 * Excalidraw (it needs eval), and it lives exclusively in SVG export. PNG export
 * stays on the eval-free path, so embedding never touches that worker.
 *
 * Throws if the drawing has no elements (an empty canvas can't be embedded).
 */
export async function drawingBodyToPng(body: string): Promise<Uint8Array> {
  const scene = JSON.parse(body) as ExcalidrawInitialDataState;
  const elements = (scene.elements ?? []) as readonly NonDeletedExcalidrawElement[];
  if (elements.length === 0) {
    throw new Error('This drawing is empty — nothing to insert.');
  }

  const blob = await exportToBlob({
    elements,
    appState: { ...(scene.appState ?? {}), exportBackground: true },
    files: (scene.files ?? null) as BinaryFiles | null,
    mimeType: 'image/png',
    exportPadding: 16,
  });

  return new Uint8Array(await blob.arrayBuffer());
}
