import { useCallback, useEffect, useRef, useState } from 'react';
import { TipTapEditor } from './TipTapEditor';
import { HtmlBodyEditor } from './HtmlBodyEditor';
import { useNote, useUpdateNote, useCreateNote } from './queries';
import { useFoldersList } from './folderQueries';
import { useProjectsList } from '../tasks/queries';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback';
import { useUI } from '../../state/ui';
import { ExportMenu } from '../export/ExportMenu';
import { AddTriageTodo } from './AddTriageTodo';
import { LinkedTasksPanel } from '../links/LinkPanels';

// ── Folder selector ───────────────────────────────────────────────────────────

/**
 * Small folder breadcrumb shown below the note title. Clicking it opens
 * a native <select> to reassign the note to a different folder (or Unfiled).
 */
function FolderSelector({
  noteId,
  folderId,
}: {
  noteId: string;
  folderId: string | null;
}): JSX.Element | null {
  const { data: folders } = useFoldersList();
  const updateNote = useUpdateNote();

  // Don't render if there are no folders yet — keeps the header clean.
  if (!folders || folders.length === 0) return null;

  const currentFolder = folders.find((f) => f.id === folderId);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const val = e.target.value;
    updateNote.mutate({
      id: noteId,
      patch: { folderId: val === '' ? null : val },
    });
  };

  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-gray-400 dark:text-gray-600" aria-hidden>📁</span>
      <select
        value={folderId ?? ''}
        onChange={handleChange}
        aria-label="Assign to folder"
        className="bg-transparent text-[11px] text-gray-400 hover:text-gray-600 focus:outline-none dark:text-gray-600 dark:hover:text-gray-400"
      >
        <option value="">Unfiled</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      {currentFolder && (
        <span className="sr-only">Current folder: {currentFolder.name}</span>
      )}
    </div>
  );
}

// ── Project selector ──────────────────────────────────────────────────────────

/**
 * Project breadcrumb shown next to the folder selector. Assigns the note to a
 * project (or none), the cross-domain counterpart to a task's project — so a
 * project's view can list its notes alongside its tasks.
 */
function ProjectSelector({
  noteId,
  projectId,
}: {
  noteId: string;
  projectId: string | null;
}): JSX.Element | null {
  const { data: projects } = useProjectsList();
  const updateNote = useUpdateNote();

  // Don't render until projects exist — keeps the header clean.
  if (!projects || projects.length === 0) return null;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const val = e.target.value;
    updateNote.mutate({
      id: noteId,
      patch: { projectId: val === '' ? null : val },
    });
  };

  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-gray-400 dark:text-gray-600" aria-hidden>#</span>
      <select
        value={projectId ?? ''}
        onChange={handleChange}
        aria-label="Assign to project"
        className="bg-transparent text-[11px] text-gray-400 hover:text-gray-600 focus:outline-none dark:text-gray-600 dark:hover:text-gray-400"
      >
        <option value="">No project</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── NoteEditor ────────────────────────────────────────────────────────────────

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

  // ── Wiki-link navigation ─────────────────────────────────────────────────

  const showToast = useUI((s) => s.showToast);
  const setMode = useUI((s) => s.setMode);
  const setSelectedNoteId = useUI((s) => s.setSelectedNoteId);
  const createNote = useCreateNote();

  const onWikiLinkClick = useCallback(
    (title: string) => {
      void (async () => {
        const existing = await window.api.notes.findByTitle({ title });
        if (existing !== null) {
          setMode('notes');
          setSelectedNoteId(existing.id);
          return;
        }
        createNote.mutate(
          { title },
          {
            onSuccess: (note) => {
              setMode('notes');
              setSelectedNoteId(note.id);
              showToast(`Created linked note: ${title}`, 'success');
            },
            onError: () => {
              showToast('Failed to create linked note', 'error');
            },
          },
        );
      })();
    },
    [createNote, setMode, setSelectedNoteId, showToast],
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
      <div className="border-b border-gray-200 px-6 py-3 dark:border-gray-800">
        <div className="flex items-center justify-between">
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
            <AddTriageTodo noteId={note.id} noteTitle={draft.title} />
            <ExportMenu noteId={note.id} />
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <FolderSelector noteId={note.id} folderId={note.folderId} />
          <ProjectSelector noteId={note.id} projectId={note.projectId} />
        </div>
        <LinkedTasksPanel noteId={note.id} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {note.bodyType === 'html' ? (
          // key={note.id} ensures the component remounts (and resets its mode
          // to 'preview') when the user switches to a different HTML note.
          <HtmlBodyEditor
            key={note.id}
            html={note.body}
            onChange={onBodyChange}
          />
        ) : (
          <TipTapEditor
            markdown={note.body}
            noteId={note.id}
            onChange={onBodyChange}
            onWikiLinkClick={onWikiLinkClick}
          />
        )}
      </div>
    </div>
  );
}
