import { useCallback, useEffect, useRef, useState } from 'react';
import { TipTapEditor } from './TipTapEditor';
import { useNote, useUpdateNote } from './queries';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback';
import { ExportMenu } from '../export/ExportMenu';
import { AddTriageTodo } from './AddTriageTodo';

interface NoteEditorProps {
  noteId: string;
}

const AUTOSAVE_DELAY_MS = 500;

interface DraftState {
  title: string;
  body: string;
  /** True when the local draft has unsaved divergence from the persisted note. */
  dirty: boolean;
}

/**
 * Note editor pane.
 *
 * Owns the local draft (title + body markdown) for the currently-selected
 * note. Edits update the draft synchronously; persistence is debounced
 * by AUTOSAVE_DELAY_MS. ⌘S flushes immediately, as does unmount and
 * note switch (handled by the parent through key change).
 */
export function NoteEditor({ noteId }: NoteEditorProps): JSX.Element {
  const { data: note, isLoading } = useNote(noteId);
  const updateNote = useUpdateNote();

  // The draft is initialised from the fetched note. We track the noteId
  // we initialised from so we don't clobber the user's draft if a stale
  // fetch result resolves after a note switch.
  const [draft, setDraft] = useState<DraftState>({
    title: '',
    body: '',
    dirty: false,
  });
  const initialisedForNoteId = useRef<string | null>(null);

  useEffect(() => {
    if (note === undefined || note === null) return;
    if (initialisedForNoteId.current === note.id) return;
    initialisedForNoteId.current = note.id;
    setDraft({ title: note.title, body: note.body, dirty: false });
  }, [note]);

  // ── Save ─────────────────────────────────────────────────────────────────

  const save = useCallback(
    (next: { title: string; body: string }) => {
      if (note === undefined || note === null) return;
      // Only patch what actually changed — keeps the audit trail cleaner
      // and prevents a no-op write from bumping updated_at unnecessarily.
      const patch: { title?: string; body?: string } = {};
      if (next.title !== note.title) patch.title = next.title;
      if (next.body !== note.body) patch.body = next.body;
      if (Object.keys(patch).length === 0) {
        setDraft((d) => ({ ...d, dirty: false }));
        return;
      }
      updateNote.mutate(
        { id: note.id, patch },
        {
          onSuccess: () => setDraft((d) => ({ ...d, dirty: false })),
        },
      );
    },
    [note, updateNote],
  );

  const debouncedSave = useDebouncedCallback(save, AUTOSAVE_DELAY_MS);

  // Flush pending saves when the note changes or the editor unmounts.
  useEffect(() => {
    return () => {
      debouncedSave.flush();
    };
  }, [noteId, debouncedSave]);

  // ── ⌘S explicit save ─────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        debouncedSave.flush();
        save({ title: draft.title, body: draft.body });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [debouncedSave, save, draft.title, draft.body]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const onTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const title = e.target.value;
      setDraft((d) => ({ ...d, title, dirty: true }));
      debouncedSave.call({ title, body: draft.body });
    },
    [debouncedSave, draft.body],
  );

  const onBodyChange = useCallback(
    (body: string) => {
      setDraft((d) => ({ ...d, body, dirty: true }));
      debouncedSave.call({ title: draft.title, body });
    },
    [debouncedSave, draft.title],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  if (isLoading || note === undefined) {
    return <div className="p-10 text-gray-500">Loading…</div>;
  }
  if (note === null) {
    return (
      <div className="p-10 text-gray-500">
        Note not found. It may have been deleted.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3 dark:border-gray-800">
        <input
          aria-label="Note title"
          value={draft.title}
          onChange={onTitleChange}
          placeholder="Untitled"
          className="flex-1 bg-transparent text-2xl font-semibold tracking-tight text-gray-900 placeholder-gray-500 focus:outline-none dark:text-white dark:placeholder-gray-600"
        />
        <div className="ml-4 flex items-center gap-3">
          <span
            className={`text-xs ${
              draft.dirty ? 'text-amber-400' : 'text-gray-600'
            }`}
            aria-live="polite"
          >
            {draft.dirty ? 'Unsaved…' : 'Saved'}
          </span>
          <AddTriageTodo noteTitle={draft.title} />
          <ExportMenu noteId={note.id} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <TipTapEditor
          markdown={note.body}
          noteId={note.id}
          onChange={onBodyChange}
        />
      </div>
    </div>
  );
}
