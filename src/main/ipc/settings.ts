import { ipcMain } from 'electron';
import { assertMainFrame } from '../security/ipc-guard';
import { SETTINGS_GET_ALL, SETTINGS_SET } from '../../shared/ipc/channels';
import { SettingsSetInput, type SettingKey } from '../../shared/schemas/settings';
import { settingsService } from '../services/settings';

export function registerSettingsHandlers(): void {
  ipcMain.handle(SETTINGS_GET_ALL, async (event) => {
    assertMainFrame(event);
    return settingsService.getAll();
  });

  ipcMain.handle(SETTINGS_SET, async (event, raw) => {
    assertMainFrame(event);
    const { key, value } = SettingsSetInput.parse(raw);
    return settingsService.set(key as SettingKey, value);
  });
}
