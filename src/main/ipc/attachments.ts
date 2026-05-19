import { ipcMain } from 'electron';
import { assertMainFrame } from '../security/ipc-guard';
import { AttachmentSaveInput } from '../../shared/schemas/attachments';
import { ATTACHMENTS_SAVE } from '../../shared/ipc/channels';
import { saveAttachment } from '../services/attachments';

/**
 * IPC handler for the attachments domain.
 *
 * Follows the §3.4 template: assertMainFrame → Schema.parse → service call.
 * The save handler is the only one needed in milestone 5 — fetching is
 * handled by the `attachment://` protocol directly (no IPC round-trip,
 * the renderer just sets `<img src="attachment://...">`).
 */
export function registerAttachmentsHandlers(): void {
  ipcMain.handle(ATTACHMENTS_SAVE, async (event, raw) => {
    assertMainFrame(event);
    const input = AttachmentSaveInput.parse(raw);
    return saveAttachment(input);
  });
}
