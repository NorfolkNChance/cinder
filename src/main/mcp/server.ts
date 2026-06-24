import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { settingsService } from '../services/settings';
import { getOrCreateToken, extractToken, verifyToken } from './auth';
import { buildMcpServer } from './tools';
import { isLoopbackHost } from './host-guard';
import type { McpServerStatus } from '../../shared/schemas/connectors';

/**
 * The local MCP server that lets Claude connect to Cinder as a custom
 * connector. It runs inside the main process (so it reuses the already-open,
 * decrypted database) and binds to 127.0.0.1 only.
 *
 * Defense in depth (see CLAUDE.md "MCP Connector" + ADR-0011):
 *   1. Loopback bind — never 0.0.0.0.
 *   2. Bearer-token auth on every request (timing-safe). Localhost is not a
 *      trust boundary; any local process can connect, so a token is mandatory.
 *   3. Host-header allowlist — blocks DNS-rebinding from a browser tab.
 *   4. Stateless per-request McpServer reflecting the current write setting.
 */

const MCP_PATH = '/mcp';

let httpServer: Server | null = null;
let boundPort: number | null = null;

function send(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body);
}

/** Parse the request path, returning the trailing path token if present. */
function parsePath(url: string | undefined): { isMcp: boolean; pathToken?: string } {
  const path = (url ?? '').split('?')[0] ?? '';
  if (path === MCP_PATH) return { isMcp: true };
  if (path.startsWith(`${MCP_PATH}/`)) {
    const token = path.slice(MCP_PATH.length + 1);
    return token ? { isMcp: true, pathToken: token } : { isMcp: true };
  }
  return { isMcp: false };
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { isMcp, pathToken } = parsePath(req.url);
  if (!isMcp) {
    send(res, 404, JSON.stringify({ error: 'not_found' }));
    return;
  }

  // 1. Host allowlist (DNS-rebinding guard).
  if (!isLoopbackHost(req.headers.host)) {
    send(res, 403, JSON.stringify({ error: 'forbidden_host' }));
    return;
  }

  // 2. Bearer token (header preferred, path segment fallback).
  const token = extractToken(req.headers.authorization, pathToken);
  if (!verifyToken(token)) {
    res.writeHead(401, {
      'content-type': 'application/json',
      'www-authenticate': 'Bearer realm="cinder"',
    });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  // 3. Build a fresh, stateless server reflecting the current write setting.
  const settings = await settingsService.getAll();
  const server = buildMcpServer({ allowWrites: settings['connectors.mcp.allowWrites'] });
  const transport = new StreamableHTTPServerTransport({
    // Stateless mode: omit sessionIdGenerator (session management disabled).
    // Plain JSON responses (no SSE) suit simple tool request/response.
    enableJsonResponse: true,
    enableDnsRebindingProtection: true,
    allowedHosts: ['127.0.0.1', 'localhost', '[::1]'],
  });

  res.on('close', () => {
    void transport.close();
    void server.close();
  });

  try {
    // The SDK models transport callbacks as `T | undefined` rather than `?: T`,
    // which trips exactOptionalPropertyTypes at this call site only. The cast
    // bridges that purely representational difference — the value is a valid
    // Transport at runtime.
    await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
    await transport.handleRequest(req, res);
  } catch (err) {
    if (!res.headersSent) {
      send(res, 500, JSON.stringify({ error: 'internal_error' }));
    }
    console.error('[cinder] MCP request failed:', err);
  }
}

/**
 * Start the loopback MCP server on the configured port. If that port is taken,
 * fall back to an ephemeral port (the chosen port is reported via getStatus).
 * Idempotent — a no-op if already running.
 */
export async function startServer(): Promise<void> {
  if (httpServer) return;
  const settings = await settingsService.getAll();
  const desiredPort = settings['connectors.mcp.port'];

  const listenOn = (port: number): Promise<Server> =>
    new Promise((resolve, reject) => {
      const srv = createServer((req, res) => {
        void handle(req, res);
      });
      srv.once('error', reject);
      // Bind to loopback ONLY — never expose on the network.
      srv.listen(port, '127.0.0.1', () => {
        srv.removeListener('error', reject);
        resolve(srv);
      });
    });

  try {
    httpServer = await listenOn(desiredPort);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      httpServer = await listenOn(0); // OS-assigned ephemeral port
    } else {
      throw err;
    }
  }
  const addr = httpServer.address();
  boundPort = addr && typeof addr === 'object' ? addr.port : desiredPort;
}

/** Stop the server if running. Idempotent. */
export async function stopServer(): Promise<void> {
  if (!httpServer) return;
  const srv = httpServer;
  httpServer = null;
  boundPort = null;
  await new Promise<void>((resolve) => srv.close(() => resolve()));
}

/** True if the HTTP listener is currently up. */
export function isRunning(): boolean {
  return httpServer !== null;
}

/** Build the full status object the renderer renders in Settings → Connectors. */
export async function getStatus(): Promise<McpServerStatus> {
  const settings = await settingsService.getAll();
  const configuredPort = settings['connectors.mcp.port'];
  const port = boundPort ?? configuredPort;
  return {
    enabled: settings['connectors.mcp.enabled'],
    running: isRunning(),
    port: configuredPort,
    boundPort,
    allowWrites: settings['connectors.mcp.allowWrites'],
    token: getOrCreateToken(),
    url: `http://127.0.0.1:${port}${MCP_PATH}`,
  };
}

/**
 * Apply the persisted `connectors.mcp.enabled` setting: start the server if it
 * should be running and isn't, stop it if it shouldn't be and is. Called on
 * boot and whenever the setting changes.
 */
export async function syncServerToSetting(): Promise<void> {
  const settings = await settingsService.getAll();
  const shouldRun = settings['connectors.mcp.enabled'];
  if (shouldRun && !isRunning()) {
    await startServer();
  } else if (!shouldRun && isRunning()) {
    await stopServer();
  }
}
