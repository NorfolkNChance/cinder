import { useUI } from '../../state/ui';
import { NoteEditor } from '../notes/NoteEditor';

/**
 * Main pane for Daily Notes mode.
 *
 * Reuses NoteEditor unchanged — daily notes are just notes with a
 * `daily_date` stamp. Autosave, attachments, and triage "+ Todo" all
 * work exactly as in regular Notes mode.
 */
export function DailyMainPane(): JSX.Element {
  const dailySelectedNoteId = useUI((s) => s.dailySelectedNoteId);

  if (dailySelectedNoteId === null) {
    return <DailyEmptyState />;
  }

  return <NoteEditor noteId={dailySelectedNoteId} />;
}

function DailyEmptyState(): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <p className="mb-2 text-3xl">📅</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Click <strong>Today →</strong> to open today&apos;s note, or choose a
          date from the sidebar.
        </p>
      </div>
    </div>
  );
}
