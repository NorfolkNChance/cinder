import { ipcMain } from 'electron';
import { assertMainFrame } from '../security/ipc-guard';
import {
  LabelCreateInput,
  LabelDeleteInput,
  LabelGetInput,
  LabelListInput,
  LabelUpdateInput,
  LabelsSetForTaskInput,
} from '../../shared/schemas/labels';
import {
  LABELS_CREATE,
  LABELS_DELETE,
  LABELS_GET,
  LABELS_LIST,
  LABELS_SET_FOR_TASK,
  LABELS_UPDATE,
} from '../../shared/ipc/channels';
import { labelsService } from '../services/labels';

export function registerLabelsHandlers(): void {
  ipcMain.handle(LABELS_CREATE, async (event, raw) => {
    assertMainFrame(event);
    return labelsService.create(LabelCreateInput.parse(raw));
  });

  ipcMain.handle(LABELS_GET, async (event, raw) => {
    assertMainFrame(event);
    const { id } = LabelGetInput.parse(raw);
    return labelsService.get(id);
  });

  ipcMain.handle(LABELS_LIST, async (event, raw) => {
    assertMainFrame(event);
    LabelListInput.parse(raw);
    return labelsService.list();
  });

  ipcMain.handle(LABELS_UPDATE, async (event, raw) => {
    assertMainFrame(event);
    return labelsService.update(LabelUpdateInput.parse(raw));
  });

  ipcMain.handle(LABELS_DELETE, async (event, raw) => {
    assertMainFrame(event);
    const { id } = LabelDeleteInput.parse(raw);
    await labelsService.delete(id);
  });

  ipcMain.handle(LABELS_SET_FOR_TASK, async (event, raw) => {
    assertMainFrame(event);
    await labelsService.setForTask(LabelsSetForTaskInput.parse(raw));
  });
}
