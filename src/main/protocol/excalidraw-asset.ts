import { net, protocol } from 'electron';
import { is } from '@electron-toolkit/utils';
import { join, normalize, sep } from 'path';
import { pathToFileURL } from 'url';

/**
 * Custom `excalidraw-asset://` protocol.
 *
 * Excalidraw lazily fetches its fonts, locale JSON, and font-subsetting worker
 * from `window.EXCALIDRAW_ASSET_PATH`. We self-host those assets (copied into
 * the renderer bundle by scripts/copy-excalidraw-assets.mjs) so the app never
 * touches the network. But in production the renderer loads from `file://`,
 * whose opaque origin does NOT satisfy CSP `'self'` — so `file://` fonts get
 * blocked and Excalidraw falls back to its esm.sh CDN (also blocked). This is
 * the same wall that motivated the `attachment://` scheme.
 *
 * The fix is identical: register a `standard` + `secure` scheme that has a real
 * origin, serve the bundled assets through it, and allow that origin in the CSP
 * font/connect/worker/script directives. The renderer points
 * EXCALIDRAW_ASSET_PATH at `excalidraw-asset://assets/` (see
 * public/set-excalidraw-asset-path.js).
 *
 * URL shape:  excalidraw-asset://assets/<relative path under the assets dir>
 *
 * Only needed under `file://`; over the dev server (http://localhost) the assets
 * are same-origin and `'self'` already covers them.
 */

export const EXCALIDRAW_ASSET_SCHEME = 'excalidraw-asset';

/** Absolute path to the bundled assets dir. In prod the renderer sits at
 * out/renderer next to out/main (__dirname). In an unpackaged run it's the same
 * layout. */
function assetsRoot(): string {
  return join(__dirname, '../renderer/excalidraw-assets');
}

/**
 * Register the scheme as standard/secure/fetch-capable. MUST run before
 * `app.whenReady()`. `standard: true` is the load-bearing flag — it gives the
 * scheme a real, comparable origin so CSP and fetch behave (a `file://`-style
 * opaque origin would not).
 */
export function registerExcalidrawAssetSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: EXCALIDRAW_ASSET_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

/**
 * Register the file-serving handler. Call from `app.whenReady()`.
 *
 * The request path is resolved under the assets root and rejected if it escapes
 * (defence in depth — the assets are static and bundled, but the renderer is
 * treated as hostile and the URL is renderer-controlled). The dev server serves
 * these itself, so the handler is a no-op there.
 */
export function registerExcalidrawAssetProtocol(): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) return;

  const root = assetsRoot();

  protocol.handle(EXCALIDRAW_ASSET_SCHEME, async (request) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return new Response('Invalid asset URL', { status: 400 });
    }

    // host is "assets"; pathname is the file path beneath the root.
    const rel = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const abs = normalize(join(root, rel));

    // Reject any path that escapes the assets root.
    if (abs !== root && !abs.startsWith(root + sep)) {
      return new Response('Forbidden', { status: 403 });
    }

    const res = await net.fetch(pathToFileURL(abs).toString());

    // The renderer document is a different origin (file:// in prod), so CSS
    // @font-face — unlike a manual fetch() — requires CORS headers to accept the
    // font; without them Excalidraw silently falls back to its CDN. We also set
    // a correct content-type (net.fetch of file:// yields octet-stream).
    const headers = new Headers(res.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    if (abs.endsWith('.woff2')) headers.set('Content-Type', 'font/woff2');
    else if (abs.endsWith('.json')) headers.set('Content-Type', 'application/json');
    else if (abs.endsWith('.js')) headers.set('Content-Type', 'text/javascript');

    return new Response(res.body, { status: res.status, headers });
  });
}

/** The base URL the renderer sets as window.EXCALIDRAW_ASSET_PATH under file://. */
export const EXCALIDRAW_ASSET_BASE = `${EXCALIDRAW_ASSET_SCHEME}://assets/`;
