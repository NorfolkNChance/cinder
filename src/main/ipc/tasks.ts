import { ipcMain } from 'electron';
import { assertMainFrame } from '../security/ipc-guard';
import {
  TaskCompleteInput,
  TaskCreateInput,
  TaskDeleteInput,
  TaskGetInput,
  TaskListInput,
  TaskUpdateInput,
} from '../../shared/schemas/tasks';
import {
  TASKS_COMPLETE,
  TASKS_CREATE,
  TASKS_DELETE,
  TASKS_GET,
  TASKS_LIST,
  TASKS_UPDATE,
} from '../../shared/ipc/channels';
import { tasksService } from '../services/tasks';

export function registerTasksHandlers(): void {
  ipcMain.handle(TASKS_CREATE, async (event, raw) => {
    assertMainFrame(event);
    return tasksService.create(TaskCreateInput.parse(raw));
  });

  ipcMain.handle(TASKS_GET, async (event, raw) => {
    assertMainFrame(event);
    const { id } = TaskGetInput.parse(raw);
    return tasksService.get(id);
  });

  ipcMain.handle(TASKS_LIST, async (event, raw) => {
    assertMainFrame(event);
    return tasksService.list(TaskListInput.parse(raw));
  });

  ipcMain.handle(TASKS_UPDATE, async (event, raw) => {
    assertMainFrame(event);
    return tasksService.update(TaskUpdateInput.parse(raw));
  });

  ipcMain.handle(TASKS_COMPLETE, async (event, raw) => {
    assertMainFrame(event);
    return tasksService.complete(TaskCompleteInput.parse(raw));
  });

  ipcMain.handle(TASKS_DELETE, async (event, raw) => {
    assertMainFrame(event);
    const { id } = TaskDeleteInput.parse(raw);
    await tasksService.delete(id);
  });
}
