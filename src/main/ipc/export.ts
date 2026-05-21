import { ipcMain } from 'electron';
import { assertMainFrame } from '../security/ipc-guard';
import {
  EXPORT_NOTE,
  EXPORT_ALL_NOTES,
  EXPORT_TASKS,
  EXPORT_BACKUP,
} from '../../shared/ipc/channels';
import {
  ExportNoteInput,
  ExportAllNotesInput,
  ExportTasksInput,
  ExportBackupInput,
} from '../../shared/schemas/export';
import {
  exportNote,
  exportAllNotes,
  exportTasks,
  exportBackup,
} from '../services/export';

export function registerExportHandlers(): void {
  ipcMain.handle(EXPORT_NOTE, async (event, raw) => {
    assertMainFrame(event);
    const input = ExportNoteInput.parse(raw);
    return exportNote(input);
  });

  ipcMain.handle(EXPORT_ALL_NOTES, async (event, raw) => {
    assertMainFrame(event);
    ExportAllNotesInput.parse(raw);
    return exportAllNotes();
  });

  ipcMain.handle(EXPORT_TASKS, async (event, raw) => {
    assertMainFrame(event);
    const input = ExportTasksInput.parse(raw);
    return exportTasks(input);
  });

  ipcMain.handle(EXPORT_BACKUP, async (event, raw) => {
    assertMainFrame(event);
    ExportBackupInput.parse(raw);
    return exportBackup();
  });
}
