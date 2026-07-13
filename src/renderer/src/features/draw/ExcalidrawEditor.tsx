import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Excalidraw,
  serializeAsJSON,
  getSceneVersion,
} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type {
  ExcalidrawInitialDataState,
  AppState,
  BinaryFiles,
} from '@excalidraw/excalidraw/types';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { useNote, useUpdateNote } from '../notes/queries';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback';
import { useFlushBeforeUnload } from '../../hooks/useFlushBeforeUnload';

const AUTOSAVE_DELAY_MS = 800;

/**
 * Parse a stored scene (the `body` of an excalidraw note) into Excalidraw's
 * initialData shape. An empty/blank body (a freshly created drawing) yields
 * `null` — Excalidraw then opens an empty canvas. Malformed JSON is treated the
 * same way rather than throwing, so a drawing never becomes un-openable.
 */
function parseScene(body: string): ExcalidrawInitialDataState | null {
  if (!body.trim()) return null;
  try {
    const scene = JSON.parse(body) as ExcalidrawInitialDataState;
    return {
      elements: scene.elements ?? [],
      appState: scene.appState ?? {},
      files: scene.files ?? {},
    };
  } catch {
    return null;
  }
}

/**
 * A lightweight signature of the parts of a scene worth persisting — the
 * element-graph version (bumped on any element edit), the number of embedded
 * files, and the canvas background. Pan/zoom/selection churn the AppState
 * without touching these, so keying saves off this signature avoids a write on
 * every pointer move while still catching real content changes.
 */
function sceneSignature(
  elements: readonly OrderedExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
): string {
  return `${getSceneVersion(elements)}:${Object.keys(files).length}:${appState.viewBackgroundColor ?? ''}`;
}

/** Observe the app's `.dark` class so Excalidraw's own theme follows Cinder's. */
function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark'),
  );
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() =>
      setIsDark(el.classList.contains('dark')),
    );
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export function ExcalidrawEditor({ drawingId }: { drawingId: string }): JSX.Element {
  const { data: note, isLoading } = useNote(drawingId);
  const updateNote = useUpdateNote();
  const isDark = useIsDark();

  // Parse the initial scene once per drawing. The Excalidraw component is
  // uncontrolled after mount, so we remount it on drawing switch via `key`
  // (set by the parent) — this memo only needs to react to the loaded body.
  const initialData = useMemo<ExcalidrawInitialDataState | null>(
    () => (note ? parseScene(note.body) : null),
    [note],
  );

  // Track the last-persisted signature so onChange only writes on real changes.
  const lastSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (note) {
      const parsed = parseScene(note.body);
      lastSignatureRef.current = parsed
        ? sceneSignature(
            (parsed.elements ?? []) as readonly OrderedExcalidrawElement[],
            (parsed.appState ?? {}) as AppState,
            (parsed.files ?? {}) as BinaryFiles,
          )
        : null;
    }
  }, [note]);

  const [dirty, setDirty] = useState(false);

  const save = useCallback(
    (body: string) => {
      updateNote.mutate(
        { id: drawingId, patch: { body } },
        { onSuccess: () => setDirty(false) },
      );
    },
    [drawingId, updateNote],
  );
  const debouncedSave = useDebouncedCallback(save, AUTOSAVE_DELAY_MS);

  useEffect(() => () => debouncedSave.flush(), [drawingId, debouncedSave]);

  // Flush on window close / app quit — the renderer is destroyed without a
  // React unmount, so the cleanup flush above never runs on that path.
  useFlushBeforeUnload(debouncedSave);

  const onChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      const sig = sceneSignature(elements, appState, files);
      if (sig === lastSignatureRef.current) return;
      lastSignatureRef.current = sig;
      setDirty(true);
      // serializeAsJSON filters AppState down to the persistable subset and
      // prunes files not referenced by any element.
      debouncedSave.call(serializeAsJSON(elements, appState, files, 'local'));
    },
    [debouncedSave],
  );

  if (isLoading || note === undefined) {
    return <div className="p-10 text-gray-500">Loading…</div>;
  }
  if (note === null) {
    return (
      <div className="p-10 text-gray-500">
        Drawing not found. It may have been deleted.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <DrawingHeader drawingId={drawingId} title={note.title} dirty={dirty} />
      <div className="min-h-0 flex-1">
        <Excalidraw
          theme={isDark ? 'dark' : 'light'}
          {...(initialData ? { initialData } : {})}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

/** Slim header: editable title + save indicator + delete, mirroring NoteEditor. */
function DrawingHeader({
  drawingId,
  title,
  dirty,
}: {
  drawingId: string;
  title: string;
  dirty: boolean;
}): JSX.Element {
  const updateNote = useUpdateNote();
  const [draftTitle, setDraftTitle] = useState(title);
  const initialisedFor = useRef<string | null>(null);

  useEffect(() => {
    if (initialisedFor.current === drawingId) return;
    initialisedFor.current = drawingId;
    setDraftTitle(title);
  }, [drawingId, title]);

  const saveTitle = useDebouncedCallback((t: string) => {
    updateNote.mutate({ id: drawingId, patch: { title: t } });
  }, 400);

  // Flush a pending title save when the header unmounts (drawing switch —
  // the parent is keyed by drawing id) and on window close / app quit.
  useEffect(() => () => saveTitle.flush(), [saveTitle]);
  useFlushBeforeUnload(saveTitle);

  return (
    <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3 dark:border-gray-800">
      <input
        aria-label="Drawing title"
        value={draftTitle}
        onChange={(e) => {
          setDraftTitle(e.target.value);
          saveTitle.call(e.target.value);
        }}
        placeholder="Untitled drawing"
        className="flex-1 bg-transparent text-2xl font-semibold tracking-tight text-gray-900 placeholder-gray-500 focus:outline-none dark:text-white dark:placeholder-gray-600"
      />
      <span
        className={`ml-4 text-xs ${dirty ? 'text-amber-400' : 'text-gray-600'}`}
        aria-live="polite"
      >
        {dirty ? 'Unsaved…' : 'Saved'}
      </span>
    </div>
  );
}
