import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useNoteRevisions, useRestoreRevision } from './queries';
import type { Note, NoteRevision } from '../../../../shared/schemas/notes';

interface NoteHistoryModalProps {
  noteId: string;
  onClose: () => void;
  /**
   * Called with the restored note right before the modal closes. The
   * TipTap editor only rehydrates its content when `noteId` changes (by
   * design — it must not reload on every keystroke-triggered autosave, or
   * the cursor would jump). A restore changes the body without changing
   * `noteId`, so the caller needs this to force a resync; see NoteEditor's
   * `restoreNonce`.
   */
  onRestored: (note: Note) => void;
}

/**
 * Relative-ish timestamp for a revision row: time-only for today, weekday +
 * time within the last week, otherwise a short date + time. Revisions are
 * checkpoints a user is scanning by eye, not exact instants, so the format
 * favours "which one is this" over precision.
 */
function formatRevisionTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diffDays = Math.floor(
    (new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) /
      (1000 * 60 * 60 * 24),
  );
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (diffDays === 0) return `Today at ${time}`;
  if (diffDays === 1) return `Yesterday at ${time}`;
  if (diffDays > 1 && diffDays < 7) {
    return `${d.toLocaleDateString(undefined, { weekday: 'long' })} at ${time}`;
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return `${d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })} at ${time}`;
}

/**
 * Version History modal for the note editor — lists this note's revision
 * checkpoints (docs/specs/note-history.md) newest first, with a read-only
 * preview and a non-destructive restore.
 *
 * Restoring snapshots the note's current state first (server-side), so
 * restoring an old version never loses the version you were just looking
 * at — it just becomes the previous checkpoint.
 */
export function NoteHistoryModal({
  noteId,
  onClose,
  onRestored,
}: NoteHistoryModalProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true);

  const { data: revisions, isLoading } = useNoteRevisions(noteId, true);
  const restoreRevision = useRestoreRevision();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Default to the most recent revision once the list loads.
  useEffect(() => {
    if (revisions && revisions.length > 0 && selectedId === null) {
      setSelectedId(revisions[0]?.id ?? null);
    }
  }, [revisions, selectedId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (confirming) setConfirming(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, confirming]);

  const selected: NoteRevision | undefined = revisions?.find(
    (r) => r.id === selectedId,
  );

  const handleRestore = (): void => {
    if (!selected) return;
    restoreRevision.mutate(
      { noteId, revisionId: selected.id },
      {
        onSuccess: (restoredNote) => {
          if (restoredNote) onRestored(restoredNote);
          onClose();
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Version History"
        aria-modal="true"
        className="flex h-[520px] w-[760px] flex-col overflow-hidden rounded-xl border border-gray-300 bg-gray-100 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
            <span aria-hidden="true">🕓</span> Version History
          </h2>
          <button
            onClick={onClose}
            aria-label="Close version history"
            className="text-gray-500 transition-colors hover:text-gray-700 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* Body: list + preview */}
        <div className="flex min-h-0 flex-1">
          {/* Revision list */}
          <div className="w-56 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            {isLoading ? (
              <p className="px-4 py-4 text-sm text-gray-500">Loading…</p>
            ) : !revisions || revisions.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-gray-500">
                No earlier versions yet. Checkpoints are captured
                automatically as you edit.
              </p>
            ) : (
              <ul role="list">
                {revisions.map((rev) => (
                  <li key={rev.id}>
                    <button
                      onClick={() => {
                        setSelectedId(rev.id);
                        setConfirming(false);
                      }}
                      aria-current={rev.id === selectedId}
                      className={`w-full border-b border-gray-100 px-4 py-2.5 text-left text-xs transition-colors dark:border-gray-900 ${
                        rev.id === selectedId
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900'
                      }`}
                    >
                      {formatRevisionTime(rev.createdAt)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Preview */}
          <div className="flex min-h-0 flex-1 flex-col">
            {selected ? (
              <>
                <div className="border-b border-gray-200 px-6 py-3 dark:border-gray-800">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                    {selected.title || 'Untitled'}
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto bg-white px-6 py-4 dark:bg-gray-950">
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-700 dark:text-gray-300">
                    {selected.body || '(empty)'}
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
                Select a version to preview it.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3 dark:border-gray-800">
          <p className="text-[11px] text-gray-500 dark:text-gray-600">
            Restoring keeps your current version in history too — nothing is
            lost.
          </p>
          {selected &&
            (confirming ? (
              <button
                onClick={handleRestore}
                disabled={restoreRevision.isPending}
                className="rounded border border-indigo-400 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70"
              >
                {restoreRevision.isPending
                  ? 'Restoring…'
                  : 'Click again to restore this version'}
              </button>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-indigo-400 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-700 dark:text-gray-400 dark:hover:border-indigo-600 dark:hover:text-indigo-400"
              >
                Restore this version…
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
