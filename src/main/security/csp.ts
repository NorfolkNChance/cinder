import { session } from 'electron';
import { is } from '@electron-toolkit/utils';

/**
 * Content Security Policy.
 *
 * Production policy follows ARCHITECTURE.md §3.2 verbatim. The renderer is
 * locked down to its own origin for scripts, styles, fonts and connections;
 * eval is forbidden; framing/forms/objects are disabled.
 *
 * Dev policy adds the minimum relaxations Vite needs to function:
 *   - 'unsafe-inline' on script-src so @vitejs/plugin-react's Fast Refresh
 *     preamble (an inline <script>) can run. Without it, the plugin throws
 *     "can't detect preamble" and React never mounts.
 *   - 'unsafe-eval' on script-src because Vite's HMR runtime uses it to
 *     evaluate updated module code without a full reload.
 *   - ws://localhost:* in connect-src for the HMR websocket.
 *   - The dev server origin (http://localhost:*) in the various -src
 *     directives so Vite can serve assets from a sibling port if 5173
 *     is taken.
 *
 * These relaxations are NEVER applied in production builds. The production
 * binary always uses the strict policy.
 */

const PROD_CSP = [
  "default-src 'self'",
  // excalidraw-asset: serves Excalidraw's self-hosted fonts/locales/worker via a
  // standard+secure scheme (file:// can't satisfy 'self'; see protocol/excalidraw-asset.ts).
  "script-src 'self' excalidraw-asset:",
  // Excalidraw spawns a module Worker for font subsetting. Note: NO 'unsafe-eval'
  // — the core drawing canvas needs no eval; only the (avoided) SVG font-embed
  // path does, and it runs inside this isolated worker realm.
  "worker-src 'self' blob: excalidraw-asset:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: attachment:",
  "font-src 'self' excalidraw-asset:",
  "connect-src 'self' excalidraw-asset:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');

const DEV_CSP = [
  "default-src 'self' http://localhost:* ws://localhost:*",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* excalidraw-asset:",
  "worker-src 'self' blob: http://localhost:* excalidraw-asset:",
  "style-src 'self' 'unsafe-inline' http://localhost:*",
  "img-src 'self' data: blob: attachment: http://localhost:*",
  "font-src 'self' http://localhost:* excalidraw-asset:",
  "connect-src 'self' http://localhost:* ws://localhost:* excalidraw-asset:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');

export function installCSP(): void {
  const policy = is.dev ? DEV_CSP : PROD_CSP;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    });
  });
}
