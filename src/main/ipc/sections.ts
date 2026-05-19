import { ipcMain } from 'electron';
import { assertMainFrame } from '../security/ipc-guard';
import {
  SectionCreateInput,
  SectionDeleteInput,
  SectionListInput,
  SectionUpdateInput,
} from '../../shared/schemas/sections';
import {
  SECTIONS_CREATE,
  SECTIONS_DELETE,
  SECTIONS_GET,
  SECTIONS_LIST,
  SECTIONS_UPDATE,
} from '../../shared/ipc/channels';
import { sectionsService } from '../services/sections';

export function registerSectionsHandlers(): void {
  ipcMain.handle(SECTIONS_CREATE, async (event, raw) => {
    assertMainFrame(event);
    return sectionsService.create(SectionCreateInput.parse(raw));
  });

  ipcMain.handle(SECTIONS_GET, async (event, raw) => {
    assertMainFrame(event);
    // Sections share the {id} get-shape with deletes; reuse the schema.
    const { id } = SectionDeleteInput.parse(raw);
    return sectionsService.get(id);
  });

  ipcMain.handle(SECTIONS_LIST, async (event, raw) => {
    assertMainFrame(event);
    return sectionsService.list(SectionListInput.parse(raw));
  });

  ipcMain.handle(SECTIONS_UPDATE, async (event, raw) => {
    assertMainFrame(event);
    return sectionsService.update(SectionUpdateInput.parse(raw));
  });

  ipcMain.handle(SECTIONS_DELETE, async (event, raw) => {
    assertMainFrame(event);
    const { id } = SectionDeleteInput.parse(raw);
    await sectionsService.delete(id);
  });
}
