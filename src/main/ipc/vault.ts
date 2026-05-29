import { ipcMain, dialog, app } from 'electron';
import { assertMainFrame } from '../security/ipc-guard';
import {
  VAULT_PICK_FOLDER,
  VAULT_SCAN,
  VAULT_IMPORT,
} from '../../shared/ipc/channels';
import { VaultScanInput, VaultImportPlan } from '../../shared/schemas/vault';
import { scanVault } from '../services/vaultScanner';
import { importVault } from '../services/vaultImporter';

export function registerVaultHandlers(): void {
  /** Open a native folder-picker and return the chosen path (or null). */
  ipcMain.handle(VAULT_PICK_FOLDER, async (event) => {
    assertMainFrame(event);
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Choose Obsidian Vault Folder',
      defaultPath: app.getPath('documents'),
      properties: ['openDirectory'],
      message: 'Select the root folder of your Obsidian vault',
      buttonLabel: 'Choose Vault',
    });
    if (canceled || !filePaths[0]) return null;
    return filePaths[0];
  });

  /** Scan a vault folder and return a preview plan. No DB writes. */
  ipcMain.handle(VAULT_SCAN, async (event, raw) => {
    assertMainFrame(event);
    const input = VaultScanInput.parse(raw);
    return scanVault(input);
  });

  /** Execute a confirmed import plan. Pushes VAULT_PROGRESS events during import. */
  ipcMain.handle(VAULT_IMPORT, async (event, raw) => {
    assertMainFrame(event);
    const plan = VaultImportPlan.parse(raw);
    return importVault(plan, event.sender);
  });
}
