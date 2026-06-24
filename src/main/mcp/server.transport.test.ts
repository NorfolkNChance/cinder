import { describe, expect, it } from 'vitest';
import { createServer, type Server } from 'http';
import { buildMcpServer } from './tools';
import { createMcpTransport } from './server';

/**
 * Regression test for the DNS-rebinding host-check bug (shipped in 1.6.0/1.6.1):
 * the SDK transport's `allowedHosts` matches the *full* Host header including
 * the port, so a port-less allowlist 403'd every real request with
 * "Invalid Host header: 127.0.0.1:<port>" — meaning `tools/list` (and thus the
 * whole connector) returned nothing to Claude. The fix is `createMcpTransport()`
 * relying on our own `isLoopbackHost` check instead.
 *
 * This stands up the same per-request server/transport the real handler uses
 * and drives a real `tools/list` over a ported loopback Host. `tools/list` does
 * not call any tool handler, so no DB is needed.
 */
describe('MCP transport accepts a ported loopback Host', () => {
  function startServer(): Promise<{ server: Server; port: number }> {
    const httpServer = createServer((req, res) => {
      void (async () => {
        const mcp = buildMcpServer({ allowWrites: false });
        const transport = createMcpTransport();
        res.on('close', () => {
          void transport.close();
          void mcp.close();
        });
        await mcp.connect(transport as unknown as Parameters<typeof mcp.connect>[0]);
        await transport.handleRequest(req, res);
      })();
    });
    return new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address();
        const port = addr && typeof addr === 'object' ? addr.port : 0;
        resolve({ server: httpServer, port });
      });
    });
  }

  it('returns the tool list over a 127.0.0.1:<port> Host (no "Invalid Host header" 403)', async () => {
    const { server, port } = await startServer();
    try {
      // fetch sets Host: 127.0.0.1:<port> — exactly the value that used to 403.
      const resp = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });

      expect(resp.status).toBe(200);
      const body = (await resp.json()) as {
        error?: { message?: string };
        result?: { tools?: Array<{ name: string }> };
      };
      expect(body.error).toBeUndefined();
      const names = (body.result?.tools ?? []).map((t) => t.name);
      // Read tools are always registered.
      expect(names).toContain('search_notes');
      expect(names).toContain('list_tasks');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
