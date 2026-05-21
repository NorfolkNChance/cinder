import { useCallback } from 'react';
import { useUI } from '../../state/ui';
import type {
  ExportNoteInput,
  ExportTasksInput,
} from '../../../../shared/schemas/export';

/**
 * Thin wrapper around `window.api.export.*` that handles the result and
 * surfaces a toast notification via the global Zustand toast slice.
 *
 * Each function is stable across renders (useCallback) so callers can
 * safely put them in dependency arrays.
 */
export function useExport() {
  const showToast = useUI((s) => s.showToast);

  const exportNote = useCallback(
    async (input: ExportNoteInput): Promise<void> => {
      const result = await window.api.export.note(input);
      if (result.success) {
        showToast('Note exported successfully.', 'success');
      } else if (result.reason === 'error') {
        showToast(result.message ?? 'Export failed.', 'error');
      }
      // 'cancelled' → user closed the dialog; no feedback needed.
    },
    [showToast],
  );

  const exportAllNotes = useCallback(async (): Promise<void> => {
    const result = await window.api.export.allNotes({});
    if (result.success) {
      showToast('All notes exported successfully.', 'success');
    } else if (result.reason === 'error') {
      showToast(result.message ?? 'Export failed.', 'error');
    }
  }, [showToast]);

  const exportTasks = useCallback(
    async (input: ExportTasksInput = {}): Promise<void> => {
      const result = await window.api.export.tasks(input);
      if (result.success) {
        showToast('Tasks exported as CSV.', 'success');
      } else if (result.reason === 'error') {
        showToast(result.message ?? 'Export failed.', 'error');
      }
    },
    [showToast],
  );

  const exportBackup = useCallback(async (): Promise<void> => {
    const result = await window.api.export.backup({});
    if (result.success) {
      showToast('Database backup saved.', 'success');
    } else if (result.reason === 'error') {
      showToast(result.message ?? 'Backup failed.', 'error');
    }
  }, [showToast]);

  return { exportNote, exportAllNotes, exportTasks, exportBackup };
}
