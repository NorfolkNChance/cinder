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
        getOrCreateDaily: (input: NoteGetOrCreateDailyInput) => Promise<Note>;
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
        list: (input: TaskListInput) => Promise<readonly TaskWithLabels[]>;
        update: (input: TaskUpdateInput) => Promise<Task | null>;
        complete: (input: TaskCompleteInput) => Promise<Task | null>;
        delete: (input: TaskDeleteInput) => Promise<void>;
      };
      labels: {
        create: (input: LabelCreateInput) => Promise<Label>;
        get: (input: LabelGetInput) => Promise<Label | null>;
        list: (input: LabelListInput) => Promise<readonly Label[]>;
        update: (input: LabelUpdateInput) => Promise<Label | null>;
        delete: (input: LabelDeleteInput) => Promise<void>;
        setForTask: (input: LabelsSetForTaskInput) => Promise<void>;
      };
      savedFilters: {
        create: (input: SavedFilterCreateInput) => Promise<SavedFilter>;
        get: (input: SavedFilterGetInput) => Promise<SavedFilter | null>;
        list: (
          input: SavedFilterListInput,
        ) => Promise<readonly SavedFilter[]>;
        update: (
          input: SavedFilterUpdateInput,
        ) => Promise<SavedFilter | null>;
        delete: (input: SavedFilterDeleteInput) => Promise<void>;
      };
      export: {
        note: (input: ExportNoteInput) => Promise<ExportResult>;
        allNotes: (input: ExportAllNotesInput) => Promise<ExportResult>;
        tasks: (input: ExportTasksInput) => Promise<ExportResult>;
        backup: (input: ExportBackupInput) => Promise<ExportResult>;
      };
      settings: {
        getAll: () => Promise<AppSettings>;
        set: (input: SettingsSetInput) => Promise<AppSettings>;
      };
      capture: {
        hide: () => Promise<void>;
      };
      notify: {
        onTaskDue: (cb: () => void) => () => void;
      };
      update: {
        check: () => Promise<void>;
        install: () => Promise<void>;
        onStatus: (cb: (status: UpdateStatus) => void) => () => void;
      };
    };
  }
}
