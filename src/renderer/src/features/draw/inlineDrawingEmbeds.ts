import { mapImageSrcs } from '../../../../shared/markdown/imageSrcs';
import { drawingBodyToPng } from './exportDrawing';
import { DRAWING_EMBED_SCHEME } from './DrawingEmbed';

/** Read a Blob as a `data:` URL (base64) without manual chunked encoding. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Replace every live `drawing://<id>` embed in a markdown body with a
 * self-contained `data:image/png` URI, by rasterizing the referenced drawing's
 * current scene (canvas raster — the eval-free export path).
 *
 * Run in the renderer before a note is exported: only the renderer can
 * rasterize Excalidraw, so live embeds must be resolved here. Static
 * `attachment://` images are inlined separately, in the main export service.
 * A missing or empty drawing is left as its original reference (best effort).
 */
export async function inlineDrawingEmbeds(body: string): Promise<string> {
  return mapImageSrcs(body, async (src) => {
    if (!src.startsWith(DRAWING_EMBED_SCHEME)) return null;
    const id = src.slice(DRAWING_EMBED_SCHEME.length);
    try {
      const drawing = await window.api.notes.get({ id });
      if (!drawing) return null;
      const png = await drawingBodyToPng(drawing.body);
      return await blobToDataUrl(new Blob([png], { type: 'image/png' }));
    } catch {
      return null;
    }
  });
}
