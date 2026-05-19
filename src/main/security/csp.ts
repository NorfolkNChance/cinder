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
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: attachment:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');

const DEV_CSP = [
  "default-src 'self' http://localhost:* ws://localhost:*",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*",
  "style-src 'self' 'unsafe-inline' http://localhost:*",
  "img-src 'self' data: blob: attachment: http://localhost:*",
  "font-src 'self' http://localhost:*",
  "connect-src 'self' http://localhost:* ws://localhost:*",
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
