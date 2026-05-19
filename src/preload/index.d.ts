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
} from '../shared/schemas/tasks';

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
        search: (input: NoteSearchInput) => Promise<readonly Note[]>;
      };
      attachments: {
        save: (input: AttachmentSaveInput) => Promise<AttachmentSaveResult>;
      };
      projects: {
        create: (input: ProjectCreateInput) => Promise<Project>;
        get: (input: ProjectGetInput) => Promise<Project | null>;
        list: (input: ProjectListInput) => Promise<readonly Project[]>;
        update: (input: ProjectUpdateInput) => Promise<Project | null>;
        archive: (input: ProjectArchiveInput) => Promise<Project | null>;
        delete: (input: ProjectDeleteInput) => Promise<void>;
      };
      sections: {
        create: (input: SectionCreateInput) => Promise<Section>;
        get: (input: SectionDeleteInput) => Promise<Section | null>;
        list: (input: SectionListInput) => Promise<readonly Section[]>;
        update: (input: SectionUpdateInput) => Promise<Section | null>;
        delete: (input: SectionDeleteInput) => Promise<void>;
      };
      tasks: {
        create: (input: TaskCreateInput) => Promise<Task>;
        get: (input: TaskGetInput) => Promise<Task | null>;
        list: (input: TaskListInput) => Promise<readonly Task[]>;
        update: (input: TaskUpdateInput) => Promise<Task | null>;
        complete: (input: TaskCompleteInput) => Promise<Task | null>;
        delete: (input: TaskDeleteInput) => Promise<void>;
      };
    };
  }
}
