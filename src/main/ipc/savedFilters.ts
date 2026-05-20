import { ipcMain } from 'electron';
import { assertMainFrame } from '../security/ipc-guard';
import {
  SavedFilterCreateInput,
  SavedFilterDeleteInput,
  SavedFilterGetInput,
  SavedFilterListInput,
  SavedFilterUpdateInput,
} from '../../shared/schemas/savedFilters';
import {
  SAVED_FILTERS_CREATE,
  SAVED_FILTERS_DELETE,
  SAVED_FILTERS_GET,
  SAVED_FILTERS_LIST,
  SAVED_FILTERS_UPDATE,
} from '../../shared/ipc/channels';
import { savedFiltersService } from '../services/savedFilters';

export function registerSavedFiltersHandlers(): void {
  ipcMain.handle(SAVED_FILTERS_CREATE, async (event, raw) => {
    assertMainFrame(event);
    return savedFiltersService.create(SavedFilterCreateInput.parse(raw));
  });

  ipcMain.handle(SAVED_FILTERS_GET, async (event, raw) => {
    assertMainFrame(event);
    const { id } = SavedFilterGetInput.parse(raw);
    return savedFiltersService.get(id);
  });

  ipcMain.handle(SAVED_FILTERS_LIST, async (event, raw) => {
    assertMainFrame(event);
    SavedFilterListInput.parse(raw);
    return savedFiltersService.list();
  });

  ipcMain.handle(SAVED_FILTERS_UPDATE, async (event, raw) => {
    assertMainFrame(event);
    return savedFiltersService.update(SavedFilterUpdateInput.parse(raw));
  });

  ipcMain.handle(SAVED_FILTERS_DELETE, async (event, raw) => {
    assertMainFrame(event);
    const { id } = SavedFilterDeleteInput.parse(raw);
    await savedFiltersService.delete(id);
  });
}
