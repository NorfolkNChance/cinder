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
/** Get or create the daily note for a YYYY-MM-DD date string. */
export const NOTES_GET_OR_CREATE_DAILY = 'notes:getOrCreateDaily' as const;

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

// ── Saved filters ────────────────────────────────────────────────────────────
export const SAVED_FILTERS_CREATE = 'savedFilters:create' as const;
export const SAVED_FILTERS_GET = 'savedFilters:get' as const;
export const SAVED_FILTERS_LIST = 'savedFilters:list' as const;
export const SAVED_FILTERS_UPDATE = 'savedFilters:update' as const;
export const SAVED_FILTERS_DELETE = 'savedFilters:delete' as const;

// ── Auto-update ───────────────────────────────────────────────────────────────
/** Renderer → Main: start an update check. */
export const UPDATE_CHECK = 'update:check' as const;
/** Renderer → Main: quit the app and install the downloaded update. */
export const UPDATE_INSTALL = 'update:install' as const;
/** Main → Renderer (push): current update status changed. */
export const UPDATE_STATUS = 'update:status' as const;

// ── Settings ─────────────────────────────────────────────────────────────────
/** Fetch all settings, with defaults applied for any missing keys. */
export const SETTINGS_GET_ALL = 'settings:getAll' as const;
/** Persist a single setting by key and return the updated settings object. */
export const SETTINGS_SET = 'settings:set' as const;

// ── Notifications ────────────────────────────────────────────────────────────
/**
 * Main → Renderer (push): one or more due/overdue tasks need attention.
 * Renderer navigates to Tasks › Today in response.
 */
export const NOTIFY_TASK_DUE = 'notify:taskDue' as const;

// ── Capture window ───────────────────────────────────────────────────────────
/** Renderer (capture window) → Main: hide the capture popup. */
export const CAPTURE_HIDE = 'capture:hide' as const;

// ── Export ───────────────────────────────────────────────────────────────────
/** Export a single note as a .md file — opens a Save dialog. */
export const EXPORT_NOTE = 'export:note' as const;
/** Export all notes as .md files into a user-chosen directory. */
export const EXPORT_ALL_NOTES = 'export:allNotes' as const;
/** Export all active tasks as a .csv file — opens a Save dialog. */
export const EXPORT_TASKS = 'export:tasks' as const;
/** Copy the encrypted DB file to a user-chosen location. */
export const EXPORT_BACKUP = 'export:backup' as const;
