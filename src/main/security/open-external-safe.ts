import { shell } from 'electron';

const ALLOWED_PROTOCOLS = new Set(['https:']);

/**
 * Safe wrapper around shell.openExternal that only permits https: URLs.
 * Rejects file:, javascript:, data:, and any other protocol.
 */
export async function openExternalSafe(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`openExternalSafe: invalid URL: ${url}`);
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `openExternalSafe: blocked protocol "${parsed.protocol}" — only https: is permitted`
    );
  }

  await shell.openExternal(parsed.href);
}
