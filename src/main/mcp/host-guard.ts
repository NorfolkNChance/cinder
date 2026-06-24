/**
 * Loopback Host-header guard for the MCP server (DNS-rebinding defense).
 *
 * A malicious web page can resolve its own hostname to 127.0.0.1 and POST to
 * the local server from the browser; the browser sends the *site's* Host
 * header, not "localhost". Rejecting any non-loopback Host blocks that path.
 * Kept as a tiny pure module so it can be unit-tested without the server chain.
 */
export function isLoopbackHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const raw = hostHeader.trim().toLowerCase();
  // Bracketed IPv6 is the only valid Host form for IPv6: [::1] or [::1]:port.
  // For IPv4/hostnames strip a trailing :port. A bare ":\d+$" strip would
  // mangle the unbracketed "::1" (eats the final ":1"), so handle it explicitly.
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(raw);
  const host = bracket ? (bracket[1] ?? '') : raw.replace(/:\d+$/, '');
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || raw === '::1';
}
