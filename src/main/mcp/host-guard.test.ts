import { describe, expect, it } from 'vitest';
import { isLoopbackHost } from './host-guard';

/**
 * The Host guard is the DNS-rebinding defense for the loopback MCP server.
 * It must accept only loopback hostnames (with or without a port) and reject
 * everything else — including a missing header.
 */
describe('isLoopbackHost', () => {
  it('accepts loopback hosts with and without ports', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('127.0.0.1:51789')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('localhost:51789')).toBe(true);
    expect(isLoopbackHost('LOCALHOST')).toBe(true); // case-insensitive
    expect(isLoopbackHost('[::1]')).toBe(true);
    expect(isLoopbackHost('[::1]:51789')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
  });

  it('rejects non-loopback and missing hosts', () => {
    expect(isLoopbackHost(undefined)).toBe(false);
    expect(isLoopbackHost('')).toBe(false);
    expect(isLoopbackHost('evil.com')).toBe(false);
    expect(isLoopbackHost('evil.com:51789')).toBe(false);
    // DNS-rebinding shape: a public name that resolves to 127.0.0.1 still
    // sends its own Host header, which must be rejected.
    expect(isLoopbackHost('attacker.example')).toBe(false);
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('10.0.0.5')).toBe(false);
    expect(isLoopbackHost('192.168.1.10:51789')).toBe(false);
    // basic-auth-style prefix must not sneak through
    expect(isLoopbackHost('127.0.0.1.evil.com')).toBe(false);
  });
});
