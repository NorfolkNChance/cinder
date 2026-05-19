/**
 * IPC channel name constants.
 *
 * Convention: '<domain>:<verb>'. One file per domain in src/main/ipc/.
 * Generic IPC bridges are forbidden by §3.4 — every channel has its own
 * dedicated handler with its own Zod schema.
 */

export const APP_GET_VERSION = 'app:getVersion' as const;

// ── Notes ────────────────────────────────────────────────────────────────────
export const NOTES_CREATE = 'notes:create' as const;
export const NOTES_GET = 'notes:get' as const;
export const NOTES_LIST = 'notes:list' as const;
export const NOTES_UPDATE = 'notes:update' as const;
export const NOTES_DELETE = 'notes:delete' as const;

// ── Attachments ──────────────────────────────────────────────────────────────
export const ATTACHMENTS_SAVE = 'attachments:save' as const;
