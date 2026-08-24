import { ipcMain } from 'electron';
import { assertMainFrame } from '../security/ipc-guard';
import {
  NoteCreateInput,
  NoteDeleteInput,
  NoteFindByTitleInput,
  NoteGetInput,
  NoteGetOrCreateDailyInput,
  NoteHardDeleteInput,
  NoteListDeletedInput,
  NoteListInput,
  NoteListRevisionsInput,
  NoteRestoreInput,
  NoteRestoreRevisionInput,
  NoteSearchInput,
  NoteUpdateInput,
} from '../../shared/schemas/notes';
import {
  NOTES_CREATE,
  NOTES_DELETE,
  NOTES_FIND_BY_TITLE,
  NOTES_GET,
  NOTES_GET_OR_CREATE_DAILY,
  NOTES_HARD_DELETE,
  NOTES_LIST,
  NOTES_LIST_DELETED,
  NOTES_LIST_REVISIONS,
  NOTES_RESTORE,
  NOTES_RESTORE_REVISION,
  NOTES_SEARCH,
  NOTES_UPDATE,
} from '../../shared/ipc/channels';
import { notesService } from '../services/notes';

/**
 * IPC handlers for the notes domain.
 *
 * Each handler follows the §3.4 template:
 *   1. assertMainFrame(event) — reject calls from injected iframes
 *   2. Schema.parse(raw)       — validate the payload, throws on failure
 *   3. Delegate to service     — no business logic in handlers
 *
 * Schema-parse failures throw synchronously and surface to the renderer as
 * a rejected promise — the renderer treats this as a programming error, not
 * a recoverable condition.
 */
export function registerNotesHandlers(): void {
  ipcMain.handle(NOTES_CREATE, async (event, raw) => {
    assertMainFrame(event);
    const input = NoteCreateInput.parse(raw);
    return notesService.create(input);
  });

  ipcMain.handle(NOTES_GET, async (event, raw) => {
    assertMainFrame(event);
    const input = NoteGetInput.parse(raw);
    return notesService.get(input.id);
  });

  ipcMain.handle(NOTES_LIST, async (event, raw) => {
    assertMainFrame(event);
    const input = NoteListInput.parse(raw);
    return notesService.list(input);
  });

  ipcMain.handle(NOTES_UPDATE, async (event, raw) => {
    assertMainFrame(event);
    const input = NoteUpdateInput.parse(raw);
    return notesService.update(input);
  });

  ipcMain.handle(NOTES_DELETE, async (event, raw) => {
    assertMainFrame(event);
    const input = NoteDeleteInput.parse(raw);
    await notesService.delete(input.id);
  });

  ipcMain.handle(NOTES_SEARCH, async (event, raw) => {
    assertMainFrame(event);
    const input = NoteSearchInput.parse(raw);
    return notesService.search(input);
  });

  ipcMain.handle(NOTES_GET_OR_CREATE_DAILY, async (event, raw) => {
    assertMainFrame(event);
    const input = NoteGetOrCreateDailyInput.parse(raw);
    return notesService.getOrCreateDaily(input);
  });

  ipcMain.handle(NOTES_FIND_BY_TITLE, async (event, raw) => {
    assertMainFrame(event);
    const input = NoteFindByTitleInput.parse(raw);
    return notesService.findByTitle(input.title);
  });

  ipcMain.handle(NOTES_LIST_DELETED, async (event, raw) => {
    assertMainFrame(event);
    const input = NoteListDeletedInput.parse(raw);
    return notesService.listDeleted(input);
  });

  ipcMain.handle(NOTES_RESTORE, async (event, raw) => {
    assertMainFrame(event);
    const input = NoteRestoreInput.parse(raw);
    return notesService.restore(input.id);
  });

  ipcMain.handle(NOTES_HARD_DELETE, async (event, raw) => {
    assertMainFrame(event);
    const input = NoteHardDeleteInput.parse(raw);
    await notesService.hardDelete(input.id);
  });

  ipcMain.handle(NOTES_LIST_REVISIONS, async (event, raw) => {
    assertMainFrame(event);
    const input = NoteListRevisionsInput.parse(raw);
    return notesService.listRevisions(input.noteId);
  });

  ipcMain.handle(NOTES_RESTORE_REVISION, async (event, raw) => {
    assertMainFrame(event);
    const input = NoteRestoreRevisionInput.parse(raw);
    return notesService.restoreRevision(input);
  });
}
