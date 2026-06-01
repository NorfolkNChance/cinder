import { ipcMain } from 'electron';
import { assertMainFrame } from '../security/ipc-guard';
import {
  FOLDERS_CREATE,
  FOLDERS_GET,
  FOLDERS_LIST,
  FOLDERS_UPDATE,
  FOLDERS_DELETE,
} from '../../shared/ipc/channels';
import {
  FolderCreateInput,
  FolderGetInput,
  FolderListInput,
  FolderUpdateInput,
  FolderDeleteInput,
} from '../../shared/schemas/folders';
import { foldersService } from '../services/folders';

export function registerFoldersHandlers(): void {
  ipcMain.handle(FOLDERS_CREATE, async (event, raw) => {
    assertMainFrame(event);
    const input = FolderCreateInput.parse(raw);
    return foldersService.create(input);
  });

  ipcMain.handle(FOLDERS_GET, async (event, raw) => {
    assertMainFrame(event);
    const input = FolderGetInput.parse(raw);
    return foldersService.get(input.id);
  });

  ipcMain.handle(FOLDERS_LIST, async (event, raw) => {
    assertMainFrame(event);
    const input = FolderListInput.parse(raw);
    return foldersService.list(input);
  });

  ipcMain.handle(FOLDERS_UPDATE, async (event, raw) => {
    assertMainFrame(event);
    const input = FolderUpdateInput.parse(raw);
    return foldersService.update(input);
  });

  ipcMain.handle(FOLDERS_DELETE, async (event, raw) => {
    assertMainFrame(event);
    const input = FolderDeleteInput.parse(raw);
    return foldersService.delete(input.id);
  });
}
