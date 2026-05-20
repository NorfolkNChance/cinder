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
export const NOTES_SEARCH = 'notes:search' as const;

// ── Attachments ──────────────────────────────────────────────────────────────
export const ATTACHMENTS_SAVE = 'attachments:save' as const;

// ── Projects ─────────────────────────────────────────────────────────────────
export const PROJECTS_CREATE = 'projects:create' as const;
export const PROJECTS_GET = 'projects:get' as const;
export const PROJECTS_LIST = 'projects:list' as const;
export const PROJECTS_UPDATE = 'projects:update' as const;
export const PROJECTS_ARCHIVE = 'projects:archive' as const;
export const PROJECTS_DELETE = 'projects:delete' as const;

// ── Sections ─────────────────────────────────────────────────────────────────
export const SECTIONS_CREATE = 'sections:create' as const;
export const SECTIONS_GET = 'sections:get' as const;
export const SECTIONS_LIST = 'sections:list' as const;
export const SECTIONS_UPDATE = 'sections:update' as const;
export const SECTIONS_DELETE = 'sections:delete' as const;

// ── Tasks ────────────────────────────────────────────────────────────────────
export const TASKS_CREATE = 'tasks:create' as const;
export const TASKS_GET = 'tasks:get' as const;
export const TASKS_LIST = 'tasks:list' as const;
export const TASKS_UPDATE = 'tasks:update' as const;
export const TASKS_COMPLETE = 'tasks:complete' as const;
export const TASKS_DELETE = 'tasks:delete' as const;

// ── Labels ───────────────────────────────────────────────────────────────────
export const LABELS_CREATE = 'labels:create' as const;
export const LABELS_GET = 'labels:get' as const;
export const LABELS_LIST = 'labels:list' as const;
export const LABELS_UPDATE = 'labels:update' as const;
export const LABELS_DELETE = 'labels:delete' as const;
export const LABELS_SET_FOR_TASK = 'labels:setForTask' as const;
