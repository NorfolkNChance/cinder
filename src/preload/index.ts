import { contextBridge, ipcRenderer } from 'electron';
import {
  APP_GET_VERSION,
  ATTACHMENTS_SAVE,
  NOTES_CREATE,
  NOTES_DELETE,
  NOTES_GET,
  NOTES_LIST,
  NOTES_SEARCH,
  NOTES_UPDATE,
} from '../shared/ipc/channels';
import type {
  Note,
  NoteCreateInput,
  NoteDeleteInput,
  NoteGetInput,
  NoteListInput,
  NoteSearchInput,
  NoteUpdateInput,
} from '../shared/schemas/notes';
import type {
  AttachmentSaveInput,
  AttachmentSaveResult,
} from '../shared/schemas/attachments';

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
  },
  attachments: {
    save: (input: AttachmentSaveInput): Promise<AttachmentSaveResult> =>
      ipcRenderer.invoke(ATTACHMENTS_SAVE, input),
  },
});
