import type {
  Note,
  NoteCreateInput,
  NoteDeleteInput,
  NoteGetInput,
  NoteListInput,
  NoteUpdateInput,
} from '../shared/schemas/notes';
import type {
  AttachmentSaveInput,
  AttachmentSaveResult,
} from '../shared/schemas/attachments';

export {};

/**
 * The typed surface area exposed to the renderer via contextBridge.
 * Mirrors src/preload/index.ts; keep the two in lockstep.
 */
declare global {
  interface Window {
    api: {
      app: {
        getVersion: () => Promise<string>;
      };
      notes: {
        create: (input: NoteCreateInput) => Promise<Note>;
        get: (input: NoteGetInput) => Promise<Note | null>;
        list: (input: NoteListInput) => Promise<readonly Note[]>;
        update: (input: NoteUpdateInput) => Promise<Note | null>;
        delete: (input: NoteDeleteInput) => Promise<void>;
      };
      attachments: {
        save: (input: AttachmentSaveInput) => Promise<AttachmentSaveResult>;
      };
    };
  }
}
