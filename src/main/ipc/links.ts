import { ipcMain } from 'electron';
import { assertMainFrame } from '../security/ipc-guard';
import {
  LinkCreateInput,
  LinkDeleteInput,
  LinkListForNoteInput,
  LinkListForTaskInput,
} from '../../shared/schemas/links';
import {
  LINKS_CREATE,
  LINKS_DELETE,
  LINKS_LIST_FOR_NOTE,
  LINKS_LIST_FOR_TASK,
} from '../../shared/ipc/channels';
import { linksService } from '../services/links';

/**
 * IPC handlers for the note ↔ task links domain.
 *
 * Follows the §3.4 template: assertMainFrame → Schema.parse → delegate to the
 * service. No business logic here.
 */
export function registerLinksHandlers(): void {
  ipcMain.handle(LINKS_CREATE, async (event, raw) => {
    assertMainFrame(event);
    const input = LinkCreateInput.parse(raw);
    await linksService.create(input);
  });

  ipcMain.handle(LINKS_DELETE, async (event, raw) => {
    assertMainFrame(event);
    const input = LinkDeleteInput.parse(raw);
    await linksService.delete(input);
  });

  ipcMain.handle(LINKS_LIST_FOR_NOTE, async (event, raw) => {
    assertMainFrame(event);
    const input = LinkListForNoteInput.parse(raw);
    return linksService.listForNote(input.noteId);
  });

  ipcMain.handle(LINKS_LIST_FOR_TASK, async (event, raw) => {
    assertMainFrame(event);
    const input = LinkListForTaskInput.parse(raw);
    return linksService.listForTask(input.taskId);
  });
}
