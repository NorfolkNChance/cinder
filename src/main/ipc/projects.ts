import { ipcMain } from 'electron';
import { assertMainFrame } from '../security/ipc-guard';
import {
  ProjectArchiveInput,
  ProjectCreateInput,
  ProjectDeleteInput,
  ProjectGetInput,
  ProjectListInput,
  ProjectUpdateInput,
} from '../../shared/schemas/projects';
import {
  PROJECTS_ARCHIVE,
  PROJECTS_CREATE,
  PROJECTS_DELETE,
  PROJECTS_GET,
  PROJECTS_LIST,
  PROJECTS_UPDATE,
} from '../../shared/ipc/channels';
import { projectsService } from '../services/projects';

export function registerProjectsHandlers(): void {
  ipcMain.handle(PROJECTS_CREATE, async (event, raw) => {
    assertMainFrame(event);
    return projectsService.create(ProjectCreateInput.parse(raw));
  });

  ipcMain.handle(PROJECTS_GET, async (event, raw) => {
    assertMainFrame(event);
    const { id } = ProjectGetInput.parse(raw);
    return projectsService.get(id);
  });

  ipcMain.handle(PROJECTS_LIST, async (event, raw) => {
    assertMainFrame(event);
    return projectsService.list(ProjectListInput.parse(raw));
  });

  ipcMain.handle(PROJECTS_UPDATE, async (event, raw) => {
    assertMainFrame(event);
    return projectsService.update(ProjectUpdateInput.parse(raw));
  });

  ipcMain.handle(PROJECTS_ARCHIVE, async (event, raw) => {
    assertMainFrame(event);
    return projectsService.archive(ProjectArchiveInput.parse(raw));
  });

  ipcMain.handle(PROJECTS_DELETE, async (event, raw) => {
    assertMainFrame(event);
    const { id } = ProjectDeleteInput.parse(raw);
    await projectsService.delete(id);
  });
}
