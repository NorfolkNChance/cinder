# 0011. Run the MCP connector in the main process over loopback HTTP, not as a stdio subprocess

Date: 2026-06-24
Status: Accepted

---

## Context

We want Cinder to connect to Claude the way the Claude Connectors Directory works —
the user enables a connector and Claude can search/read their notes and tasks (and,
opt-in, capture new ones). The Model Context Protocol (MCP) is the integration surface.

The conventional way to expose a local app to Claude Desktop is a **stdio MCP server**:
a separate Node process declared in `claude_desktop_config.json` that Claude Desktop
launches and talks to over stdin/stdout. That does not work for Cinder:

- The database is **SQLCipher-encrypted** with a key held in the macOS Keychain via
  `safeStorage`, scoped to the Cinder app's code-signing identity. A separate process
  launched by Claude Desktop has a different identity and **cannot decrypt the key**, so
  it cannot read the database at all (see `src/main/db/index.ts:getOrCreateDbKey`).
- Even if the key were shareable, two processes opening the same WAL-mode SQLite file is
  a concurrency and corruption hazard, and would duplicate the entire service layer.

Cinder is local-first and security is foundational ("treat everything outside the main
process as hostile"). Any integration must reuse the existing main-process service layer
and its validation discipline rather than open a second, weaker path to the data.

## Decision

Run the MCP server **inside Cinder's main process**, exposed over **loopback HTTP** using
the MCP TypeScript SDK's Streamable HTTP transport. Claude connects to it as a **custom
connector** at `http://127.0.0.1:<port>/mcp`.

Key implementation points:

- **Reuse the service layer.** Every MCP tool calls `notesService` / `tasksService` /
  etc. — the same functions the IPC handlers call. No raw SQL in the MCP layer. The MCP
  boundary is treated exactly like the renderer/IPC boundary: a new untrusted-input edge.
- **Bundle the SDK into the main output.** `@modelcontextprotocol/sdk` is ESM-only;
  leaving it external would emit a `require()` of an ESM package from the CJS main bundle.
  `electron.vite.config.ts` excludes it from `externalizeDepsPlugin` so Rollup converts it
  (and its transitive deps) to CJS at build time. It is pure JS (no native bindings), and
  lives in `devDependencies` (bundled deps are not shipped in `node_modules`).
- **Security model (defense in depth):**
  1. **Loopback bind only** — `server.listen(port, '127.0.0.1')`, never `0.0.0.0`.
  2. **Bearer token, mandatory.** Localhost is not a trust boundary — any local process
     can reach the listener — so every request must present a 32-byte random token,
     compared with `timingSafeEqual`. The token is stored as a `safeStorage`-encrypted
     blob (same pattern as the DB key) and is rotatable.
  3. **Host-header allowlist** (`isLoopbackHost`) plus the SDK's DNS-rebinding protection,
     to block a browser tab from POSTing to the server via a rebound hostname.
  4. **Writes are opt-in.** Read tools are always registered; write tools are registered
     only when `connectors.mcp.allowWrites` is true. Captured tasks default to the Triage
     queue (`triage: 1`), mirroring quick-capture.
  5. **Off by default** (`connectors.mcp.enabled` = false) and **only runs while Cinder is
     open** — acceptable for a local-first app.
  6. **Audit log** of every tool call (no secrets) surfaced read-only in Settings.
- **Stateless transport.** A fresh `McpServer` is built per request (no session state), so
  the advertised tool set always reflects the current write setting.

## Alternatives considered

| Option | Why not chosen |
|--------|---------------|
| stdio MCP subprocess (`claude_desktop_config.json`) | Cannot decrypt the Keychain-scoped DB key from a foreign process; multi-process WAL access risks corruption; duplicates the service layer. |
| Remote HTTPS connector + OAuth, hosted | Defeats local-first; would require shipping user data off-device or punching a tunnel. Out of scope for v1. |
| Loopback HTTP with **no** token (rely on 127.0.0.1) | Localhost is not a trust boundary — any local process (or a malicious page via DNS-rebinding) could read all notes. Rejected. |
| Token in the URL path only (capability URL) | Kept as a *fallback* for clients that can't set headers, but `Authorization: Bearer` is preferred since URLs are more prone to logging/lewinakage. |

## Consequences

**Positive**
- Reuses the already-decrypted DB and the full, validated service layer — one data path,
  one set of Zod contracts.
- No new process, no key sharing, no file-locking hazard.
- The connector experience is one toggle in Settings; the user pastes a URL + token.

**Negative / watch points**
- **Connection mechanism correction (post-ship):** Claude Desktop's "Add custom connector"
  URL field only accepts **public `https`** URLs and rejects `http://127.0.0.1:…` with
  "URL must start with 'https'". A loopback HTTP server therefore cannot be added that way.
  The working path is Claude Desktop's **stdio** transport via `claude_desktop_config.json`
  using the `mcp-remote` bridge (stdio↔HTTP) with the bearer token passed as a header and
  `--transport http-only` (our transport is JSON-only, no SSE). The in-app instructions and
  help now generate this config ("Copy config"); do not document the URL-field approach.
- **Host-check bug (fixed in 1.6.2):** the SDK transport's `enableDnsRebindingProtection`
  matches the *full* Host header including the port, so the original port-less
  `allowedHosts: ['127.0.0.1', …]` 403'd every authenticated request ("Invalid Host header")
  and the connector returned zero tools. The transport now uses only `enableJsonResponse`;
  our own `isLoopbackHost` (port-stripping) is the host guard. Regression test:
  `src/main/mcp/server.transport.test.ts`. Verified end-to-end against the real `mcp-remote`
  bridge.
- The connector only works **while Cinder is running**. Documented in-app.
- A localhost listener is reachable by other local processes; the bearer token is the only
  thing protecting the data, so token handling (timing-safe compare, encrypted at rest,
  rotation) must never regress. **Any future change that weakens the token check or binds
  beyond loopback is a security regression.**
- The MCP SDK is bundled, adding ~480 KB to the main bundle. Acceptable; verify the main
  bundle size after SDK bumps (see the electron.vite.config gotcha in CLAUDE.md).
- The custom-connector UX is not the curated Directory listing. A future ADR can add a
  proper OAuth authorization flow for a one-click "Connect" (Phase 5).

**Neutral**
- New settings keys (`connectors.mcp.*`) need no migration — the settings service backfills
  from `DEFAULT_SETTINGS`.
- The MCP boundary does not use `assertMainFrame` (that is IPC/frame-specific); its
  equivalent guards are the loopback bind + token + Host allowlist.
