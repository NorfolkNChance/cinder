import { useEffect, useState } from 'react';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { ConfiguredImage } from '../../../../shared/markdown/schema';
import { useNote } from '../notes/queries';
import { useUI } from '../../state/ui';
import { drawingBodyToPng } from './exportDrawing';

/**
 * Live drawing embeds.
 *
 * A drawing embed is an ordinary `image` node whose `src` is `drawing://<id>`
 * (a logical reference, never fetched over a protocol). It round-trips through
 * markdown as `![title](drawing://id)` with no serde changes — markdown-it's
 * validateLink only blocks javascript/vbscript/file/data, so this scheme passes
 * the same way `attachment://` does.
 *
 * The React NodeView below renders the *current* state of the referenced
 * drawing: it fetches the drawing note reactively (TanStack Query) and
 * re-rasterizes to PNG whenever the scene changes — so editing the drawing in
 * Draw mode and returning to the note shows the update. Double-click opens the
 * drawing for editing. This is distinct from a snapshot embed (a static
 * `attachment://` PNG), which does not update.
 *
 * Non-drawing images (attachment://, data:) pass straight through to a plain
 * <img>, preserving existing behavior.
 */

export const DRAWING_EMBED_SCHEME = 'drawing://';

/** Build the embed src for a drawing id. */
export function drawingEmbedSrc(drawingId: string): string {
  return `${DRAWING_EMBED_SCHEME}${drawingId}`;
}

function DrawingEmbedView(props: ReactNodeViewProps): JSX.Element {
  const src = (props.node.attrs['src'] as string | undefined) ?? '';
  const alt = (props.node.attrs['alt'] as string | undefined) ?? '';
  const title = (props.node.attrs['title'] as string | undefined) ?? undefined;

  if (!src.startsWith(DRAWING_EMBED_SCHEME)) {
    // Ordinary image — render as before.
    return (
      <NodeViewWrapper as="span">
        <img src={src} alt={alt} {...(title ? { title } : {})} />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as="span" className="inline-block align-bottom">
      <LiveDrawingEmbed drawingId={src.slice(DRAWING_EMBED_SCHEME.length)} alt={alt} />
    </NodeViewWrapper>
  );
}

function LiveDrawingEmbed({
  drawingId,
  alt,
}: {
  drawingId: string;
  alt: string;
}): JSX.Element {
  const { data: drawing, isLoading } = useNote(drawingId);
  const setMode = useUI((s) => s.setMode);
  const setSelectedDrawingId = useUI((s) => s.setSelectedDrawingId);

  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const body = drawing?.body;
  useEffect(() => {
    if (body === undefined) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const png = await drawingBodyToPng(body);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
        setUrl(objectUrl);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to render drawing');
        setUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [body]);

  const open = (): void => {
    setMode('draw');
    setSelectedDrawingId(drawingId);
  };

  // The drawing was deleted out from under the embed.
  if (drawing === null) {
    return (
      <span
        contentEditable={false}
        className="inline-flex items-center gap-1 rounded border border-dashed border-gray-400 px-2 py-1 text-xs text-gray-500 dark:border-gray-600"
      >
        ⚠️ Drawing not found
      </span>
    );
  }

  if (isLoading && url === null && error === null) {
    return (
      <span contentEditable={false} className="text-xs text-gray-500">
        Loading drawing…
      </span>
    );
  }

  return (
    <span
      contentEditable={false}
      onDoubleClick={open}
      title="Double-click to edit in Draw mode"
      className="group relative inline-block cursor-pointer rounded ring-1 ring-transparent hover:ring-emerald-500"
    >
      {error !== null ? (
        <span className="inline-flex items-center gap-1 rounded border border-dashed border-gray-400 px-2 py-1 text-xs text-gray-500 dark:border-gray-600">
          ✏️ {error}
        </span>
      ) : url !== null ? (
        <img src={url} alt={alt} className="block max-w-full rounded" />
      ) : (
        <span className="text-xs text-gray-500">Rendering…</span>
      )}
      <button
        type="button"
        contentEditable={false}
        onClick={(e) => {
          e.preventDefault();
          open();
        }}
        className="absolute right-1 top-1 hidden rounded bg-gray-900/80 px-1.5 py-0.5 text-[11px] text-white group-hover:block"
      >
        ✏️ Edit
      </button>
    </span>
  );
}

/**
 * Image extension with the live-drawing NodeView layered on. Extends the shared
 * ConfiguredImage so the node spec (and thus markdown round-trip) is identical
 * to the serde schema — only the editor-side rendering differs.
 */
export const ImageWithDrawingEmbed = ConfiguredImage.extend({
  addNodeView() {
    return ReactNodeViewRenderer(DrawingEmbedView);
  },
});
