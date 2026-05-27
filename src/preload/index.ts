import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  APP_GET_VERSION,
  ATTACHMENTS_SAVE,
  NOTES_CREATE,
  NOTES_DELETE,
  NOTES_GET,
  NOTES_GET_OR_CREATE_DAILY,
  NOTES_LIST,
  NOTES_SEARCH,
  NOTES_UPDATE,
  PROJECTS_ARCHIVE,
  PROJECTS_CREATE,
  PROJECTS_DELETE,
  PROJECTS_GET,
  PROJECTS_LIST,
  PROJECTS_UPDATE,
  SECTIONS_CREATE,
  SECTIONS_DELETE,
  SECTIONS_GET,
  SECTIONS_LIST,
  SECTIONS_UPDATE,
  TASKS_COMPLETE,
  TASKS_CREATE,
  TASKS_DELETE,
  TASKS_GET,
  TASKS_LIST,
  TASKS_UPDATE,
  LABELS_CREATE,
  LABELS_DELETE,
  LABELS_GET,
  LABELS_LIST,
  LABELS_SET_FOR_TASK,
  LABELS_UPDATE,
  SAVED_FILTERS_CREATE,
  SAVED_FILTERS_DELETE,
  SAVED_FILTERS_GET,
  SAVED_FILTERS_LIST,
  SAVED_FILTERS_UPDATE,
  EXPORT_NOTE,
  EXPORT_ALL_NOTES,
  EXPORT_TASKS,
  EXPORT_BACKUP,
  SETTINGS_GET_ALL,
  SETTINGS_SET,
  UPDATE_CHECK,
  UPDATE_INSTALL,
  UPDATE_STATUS,
  CAPTURE_HIDE,
  NOTIFY_TASK_DUE,
} from '../shared/ipc/channels';
import type {
  Note,
  NoteCreateInput,
  NoteDeleteInput,
  NoteGetInput,
  NoteGetOrCreateDailyInput,
  NoteListInput,
  NoteSearchInput,
  NoteUpdateInput,
} from '../shared/schemas/notes';
import type {
  AttachmentSaveInput,
  AttachmentSaveResult,
} from '../shared/schemas/attachments';
import type {
  Project,
  ProjectArchiveInput,
  ProjectCreateInput,
  ProjectDeleteInput,
  ProjectGetInput,
  ProjectListInput,
  ProjectUpdateInput,
} from '../shared/schemas/projects';
import type {
  Section,
  SectionCreateInput,
  SectionDeleteInput,
  SectionListInput,
  SectionUpdateInput,
} from '../shared/schemas/sections';
import type {
  Task,
  TaskCompleteInput,
  TaskCreateInput,
  TaskDeleteInput,
  TaskGetInput,
  TaskListInput,
  TaskUpdateInput,
  TaskWithLabels,
} from '../shared/schemas/tasks';
import type {
  Label,
  LabelCreateInput,
  LabelDeleteInput,
  LabelGetInput,
  LabelListInput,
  LabelUpdateInput,
  LabelsSetForTaskInput,
} from '../shared/schemas/labels';
import type {
  SavedFilter,
  SavedFilterCreateInput,
  SavedFilterDeleteInput,
  SavedFilterGetInput,
  SavedFilterListInput,
  SavedFilterUpdateInput,
} from '../shared/schemas/savedFilters';
import type {
  ExportNoteInput,
  ExportAllNotesInput,
  ExportTasksInput,
  ExportBackupInput,
  ExportResult,
} from '../shared/schemas/export';
import type {
  AppSettings,
  SettingsSetInput,
} from '../shared/schemas/settings';
import type { UpdateStatus } from '../shared/schemas/update';

/**
 * Preload — the only path from the sandboxed renderer to the main process.
 * Exposes a narrow, typed API via contextBridge. No Node primitives leak.
 * Generic IPC bridges are forbidden (§3.4) — each operation is a discrete
 * method backed by a discrete channel.
 */
contextBridge.exposeInMainWorld('api', {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(APP_GET_VERSION),
  },
  notes: {
    create: (input: NoteCreateInput): Promise<Note> =>
      ipcRenderer.invoke(NOTES_CREATE, input),
    get: (input: NoteGetInput): Promise<Note | null> =>
      ipcRenderer.invoke(NOTES_GET, input),
    list: (input: NoteListInput): Promise<readonly Note[]> =>
      ipcRenderer.invoke(NOTES_LIST, input),
    update: (input: NoteUpdateInput): Promise<Note | null> =>
      ipcRenderer.invoke(NOTES_UPDATE, input),
    delete: (input: NoteDeleteInput): Promise<void> =>
      ipcRenderer.invoke(NOTES_DELETE, input),
    search: (input: NoteSearchInput): Promise<readonly Note[]> =>
      ipcRenderer.invoke(NOTES_SEARCH, input),
    getOrCreateDaily: (input: NoteGetOrCreateDailyInput): Promise<Note> =>
      ipcRenderer.invoke(NOTES_GET_OR_CREATE_DAILY, input),
  },
  attachments: {
    save: (input: AttachmentSaveInput): Promise<AttachmentSaveResult> =>
      ipcRenderer.invoke(ATTACHMENTS_SAVE, input),
  },
  projects: {
    create: (input: ProjectCreateInput): Promise<Project> =>
      ipcRenderer.invoke(PROJECTS_CREATE, input),
    get: (input: ProjectGetInput): Promise<Project | null> =>
      ipcRenderer.invoke(PROJECTS_GET, input),
    list: (input: ProjectListInput): Promise<readonly Project[]> =>
      ipcRenderer.invoke(PROJECTS_LIST, input),
    update: (input: ProjectUpdateInput): Promise<Project | null> =>
      ipcRenderer.invoke(PROJECTS_UPDATE, input),
    archive: (input: ProjectArchiveInput): Promise<Project | null> =>
      ipcRenderer.invoke(PROJECTS_ARCHIVE, input),
    delete: (input: ProjectDeleteInput): Promise<void> =>
      ipcRenderer.invoke(PROJECTS_DELETE, input),
  },
  sections: {
    create: (input: SectionCreateInput): Promise<Section> =>
      ipcRenderer.invoke(SECTIONS_CREATE, input),
    get: (input: SectionDeleteInput): Promise<Section | null> =>
      ipcRenderer.invoke(SECTIONS_GET, input),
    list: (input: SectionListInput): Promise<readonly Section[]> =>
      ipcRenderer.invoke(SECTIONS_LIST, input),
    update: (input: SectionUpdateInput): Promise<Section | null> =>
      ipcRenderer.invoke(SECTIONS_UPDATE, input),
    delete: (input: SectionDeleteInput): Promise<void> =>
      ipcRenderer.invoke(SECTIONS_DELETE, input),
  },
  tasks: {
    create: (input: TaskCreateInput): Promise<Task> =>
      ipcRenderer.invoke(TASKS_CREATE, input),
    get: (input: TaskGetInput): Promise<Task | null> =>
      ipcRenderer.invoke(TASKS_GET, input),
    list: (input: TaskListInput): Promise<readonly TaskWithLabels[]> =>
      ipcRenderer.invoke(TASKS_LIST, input),
    update: (input: TaskUpdateInput): Promise<Task | null> =>
      ipcRenderer.invoke(TASKS_UPDATE, input),
    complete: (input: TaskCompleteInput): Promise<Task | null> =>
      ipcRenderer.invoke(TASKS_COMPLETE, input),
    delete: (input: TaskDeleteInput): Promise<void> =>
      ipcRenderer.invoke(TASKS_DELETE, input),
  },
  labels: {
    create: (input: LabelCreateInput): Promise<Label> =>
      ipcRenderer.invoke(LABELS_CREATE, input),
    get: (input: LabelGetInput): Promise<Label | null> =>
      ipcRenderer.invoke(LABELS_GET, input),
    list: (input: LabelListInput): Promise<readonly Label[]> =>
      ipcRenderer.invoke(LABELS_LIST, input),
    update: (input: LabelUpdateInput): Promise<Label | null> =>
      ipcRenderer.invoke(LABELS_UPDATE, input),
    delete: (input: LabelDeleteInput): Promise<void> =>
      ipcRenderer.invoke(LABELS_DELETE, input),
    setForTask: (input: LabelsSetForTaskInput): Promise<void> =>
      ipcRenderer.invoke(LABELS_SET_FOR_TASK, input),
  },
  savedFilters: {
    create: (input: SavedFilterCreateInput): Promise<SavedFilter> =>
      ipcRenderer.invoke(SAVED_FILTERS_CREATE, input),
    get: (input: SavedFilterGetInput): Promise<SavedFilter | null> =>
      ipcRenderer.invoke(SAVED_FILTERS_GET, input),
    list: (input: SavedFilterListInput): Promise<readonly SavedFilter[]> =>
      ipcRenderer.invoke(SAVED_FILTERS_LIST, input),
    update: (input: SavedFilterUpdateInput): Promise<SavedFilter | null> =>
      ipcRenderer.invoke(SAVED_FILTERS_UPDATE, input),
    delete: (input: SavedFilterDeleteInput): Promise<void> =>
      ipcRenderer.invoke(SAVED_FILTERS_DELETE, input),
  },
  export: {
    note: (input: ExportNoteInput): Promise<ExportResult> =>
      ipcRenderer.invoke(EXPORT_NOTE, input),
    allNotes: (input: ExportAllNotesInput): Promise<ExportResult> =>
      ipcRenderer.invoke(EXPORT_ALL_NOTES, input),
    tasks: (input: ExportTasksInput): Promise<ExportResult> =>
      ipcRenderer.invoke(EXPORT_TASKS, input),
    backup: (input: ExportBackupInput): Promise<ExportResult> =>
      ipcRenderer.invoke(EXPORT_BACKUP, input),
  },
  settings: {
    getAll: (): Promise<AppSettings> =>
      ipcRenderer.invoke(SETTINGS_GET_ALL),
    set: (input: SettingsSetInput): Promise<AppSettings> =>
      ipcRenderer.invoke(SETTINGS_SET, input),
  },
  capture: {
    /**
     * Tell the main process to hide the capture popup window.
     * Called by the capture renderer after task creation or Escape.
     */
    hide: (): Promise<void> => ipcRenderer.invoke(CAPTURE_HIDE),
  },
  notify: {
    /**
     * Subscribe to due/overdue task notifications pushed from the main process.
     * The callback fires when the user clicks a system notification — navigate
     * to Tasks › Today in response.
     * Returns a cleanup function to unsubscribe.
     */
    onTaskDue: (cb: () => void): (() => void) => {
      const handler = (_e: IpcRendererEvent): void => cb();
      ipcRenderer.on(NOTIFY_TASK_DUE, handler);
      return () => ipcRenderer.off(NOTIFY_TASK_DUE, handler);
    },
  },
  update: {
    /**
     * Ask the main process to check for updates.
     * Status changes arrive via `onStatus`.
     */
    check: (): Promise<void> =>
      ipcRenderer.invoke(UPDATE_CHECK),
    /**
     * Quit the app and install the downloaded update.
     * Only call when status.phase === 'ready'.
     */
    install: (): Promise<void> =>
      ipcRenderer.invoke(UPDATE_INSTALL),
    /**
     * Subscribe to update status pushes from the main process.
     * Returns a cleanup function — call it to unsubscribe.
     *
     * Example:
     *   const off = window.api.update.onStatus((s) => setState(s));
     *   return off; // inside useEffect
     */
    onStatus: (cb: (status: UpdateStatus) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, status: UpdateStatus): void =>
        cb(status);
      ipcRenderer.on(UPDATE_STATUS, handler);
      return () => ipcRenderer.off(UPDATE_STATUS, handler);
    },
  },
});
