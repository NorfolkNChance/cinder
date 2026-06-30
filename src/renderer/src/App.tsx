import { useEffect, useRef, useState, useCallback } from 'react';
import clsx from 'clsx';
import { NoteList } from './features/notes/NoteList';
import { NoteEditor } from './features/notes/NoteEditor';
import { TasksSidebar } from './features/tasks/TasksSidebar';
import { TaskList } from './features/tasks/TaskList';
import { MatrixSidebar } from './features/matrix/MatrixSidebar';
import { MatrixView } from './features/matrix/MatrixView';
import { DailySidebar } from './features/dailyNotes/DailySidebar';
import { DailyMainPane } from './features/dailyNotes/DailyMainPane';
import { DrawSidebar } from './features/draw/DrawSidebar';
import { DrawMainPane } from './features/draw/DrawMainPane';
import { CommandPalette } from './features/commandPalette/CommandPalette';
import { GlobalSearch } from './features/globalSearch/GlobalSearch';
import { HelpModal } from './features/help/HelpModal';
import { VaultImportModal } from './features/vaultImport/VaultImportModal';
import { SettingsModal } from './features/settings/SettingsModal';
import { UpdateBanner } from './features/update/UpdateBanner';
import { Toast } from './components/Toast';
import { useUI, type Mode } from './state/ui';
import { useCreateNote } from './features/notes/queries';
import { importDroppedFiles } from './features/notes/fileImport';
import { useSettings } from './features/settings/useSettings';
import { ThemeWatcher } from './features/settings/ThemeWatcher';

/**
 * Top-level layout.
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ TopBar — global mode switcher                            │
 *   ├──────────┬───────────────────────────────────────────────┤
 *   │          │                                               │
 *   │ Sidebar  │ Main pane                                     │
 *   │          │                                               │
 *   └──────────┴───────────────────────────────────────────────┘
 *
 * Sidebar contents and main pane both switch on the active mode.
 * Each mode owns its own selection (selectedNoteId / taskScope) so
 * switching back to a mode restores what the user was looking at.
 */
export default function App(): JSX.Element {
  const mode = useUI((s) => s.mode);
  const openCommandPalette = useUI((s) => s.openCommandPalette);
  const openGlobalSearch = useUI((s) => s.openGlobalSearch);
  const openHelp = useUI((s) => s.openHelp);
  const openSettings = useUI((s) => s.openSettings);
  const helpOpen = useUI((s) => s.helpOpen);
  const setMode = useUI((s) => s.setMode);
  const setTaskScope = useUI((s) => s.setTaskScope);
  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed);
  const toggleSidebar = useUI((s) => s.toggleSidebar);

  // Navigate to Tasks › Today when the user clicks a due-task notification.
  useEffect(() => {
    return window.api.notify.onTaskDue(() => {
      setMode('tasks');
      setTaskScope({ kind: 'today' });
    });
  }, [setMode, setTaskScope]);

  // Global shortcuts — ⌘K, ⌘/, ?, ⌘,
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // ⌘K — command palette (always, even in editable context)
      if (e.key === 'k' && e.metaKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        openCommandPalette();
        return;
      }
      // ⌘⇧F — application-wide content search (always, even while typing).
      // Note: lower-cased compare because Shift makes e.key 'F'.
      if (e.key.toLowerCase() === 'f' && e.metaKey && e.shiftKey && !e.altKey) {
        e.preventDefault();
        openGlobalSearch();
        return;
      }
      // ⌘\ — collapse / expand the left nav panel (always, even while typing).
      // Backslash is used (not ⌘B) to avoid clashing with the editor's bold.
      if (e.key === '\\' && e.metaKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      // ⌘, — settings
      if (e.key === ',' && e.metaKey) {
        e.preventDefault();
        openSettings();
        return;
      }
      // ⌘/ — help (always)
      if (e.key === '/' && e.metaKey) {
        e.preventDefault();
        openHelp();
        return;
      }
      // ? — help (only when not typing; skip if help is already open)
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !helpOpen) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName ?? '';
        if (
          tag !== 'INPUT' &&
          tag !== 'TEXTAREA' &&
          tag !== 'SELECT' &&
          !target?.isContentEditable
        ) {
          e.preventDefault();
          openHelp();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openCommandPalette, openGlobalSearch, openHelp, openSettings, toggleSidebar, helpOpen]);

  return (
    <div className="flex h-screen flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-white">
      {/* Skip to main content — visible on focus for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded focus:bg-indigo-600 focus:px-3 focus:py-1.5 focus:text-sm focus:text-white"
      >
        Skip to main content
      </a>
      <SettingsInitializer />
      <ThemeWatcher />
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {!sidebarCollapsed && (
          <aside
            aria-label={
              mode === 'notes'
                ? 'Notes sidebar'
                : mode === 'tasks'
                ? 'Tasks sidebar'
                : mode === 'daily'
                ? 'Daily notes sidebar'
                : mode === 'draw'
                ? 'Drawings sidebar'
                : 'Matrix sidebar'
            }
            className="flex h-full w-64 flex-col border-r border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-950"
          >
            {mode === 'notes' ? (
              <NoteList />
            ) : mode === 'tasks' ? (
              <TasksSidebar />
            ) : mode === 'daily' ? (
              <DailySidebar />
            ) : mode === 'draw' ? (
              <DrawSidebar />
            ) : (
              <MatrixSidebar />
            )}
          </aside>
        )}
        <main id="main-content" className="min-w-0 flex-1 overflow-hidden" tabIndex={-1}>
          {mode === 'notes' ? (
            <NotesMainPane />
          ) : mode === 'tasks' ? (
            <TaskList />
          ) : mode === 'daily' ? (
            <DailyMainPane />
          ) : mode === 'draw' ? (
            <DrawMainPane />
          ) : (
            <MatrixView />
          )}
        </main>
      </div>
      {/* Global overlays — always mounted, shown when open */}
      <CommandPalette />
      <GlobalSearch />
      <HelpModal />
      <SettingsModal />
      <VaultImportModal />
      <UpdateBanner />
      <Toast />
    </div>
  );
}

// ── Settings initializer ─────────────────────────────────────────────────────

/**
 * Render-nothing component that loads persisted settings on startup and
 * applies them to the Zustand store. Mounted once above the layout so it
 * runs before the user sees any UI.
 *
 * Matrix prefs and default task scope are applied only on the first load
 * (tracked by `appliedRef`). Subsequent settings mutations (e.g., the user
 * changing urgency days in the Settings modal) are reflected immediately
 * in the MatrixView because that view reads `matrixPrefs` from Zustand and
 * the Settings modal calls `setMatrixPrefs` directly via `useSettings` +
 * the mutation success callback below.
 */
function SettingsInitializer(): null {
  const { settings } = useSettings();
  const setMatrixPrefs = useUI((s) => s.setMatrixPrefs);
  const setTaskScope = useUI((s) => s.setTaskScope);
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!settings || appliedRef.current) return;
    appliedRef.current = true;
    setMatrixPrefs({
      urgencyDays: settings['matrix.urgencyDays'],
      importanceCutoff: settings['matrix.importanceCutoff'],
    });
    setTaskScope({ kind: settings['tasks.defaultScope'] });
  }, [settings, setMatrixPrefs, setTaskScope]);

  return null;
}

// ── Top bar ─────────────────────────────────────────────────────────────────

function TopBar(): JSX.Element {
  const mode = useUI((s) => s.mode);
  const setMode = useUI((s) => s.setMode);
  const openCommandPalette = useUI((s) => s.openCommandPalette);
  const openGlobalSearch = useUI((s) => s.openGlobalSearch);
  const openHelp = useUI((s) => s.openHelp);
  const openSettings = useUI((s) => s.openSettings);
  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed);
  const toggleSidebar = useUI((s) => s.toggleSidebar);

  return (
    <header className="flex items-center gap-1 border-b border-gray-200 px-3 py-1.5 dark:border-gray-800" aria-label="Application toolbar">
      <button
        onClick={toggleSidebar}
        aria-pressed={sidebarCollapsed}
        title={sidebarCollapsed ? 'Show sidebar (⌘\\)' : 'Hide sidebar (⌘\\)'}
        aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        className="mr-1 flex items-center rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-200"
      >
        <span aria-hidden="true">{sidebarCollapsed ? '⇥' : '⇤'}</span>
      </button>
      <ModeButton active={mode === 'notes'} onClick={() => setMode('notes')}>
        Notes
      </ModeButton>
      <ModeButton active={mode === 'tasks'} onClick={() => setMode('tasks')}>
        Tasks
      </ModeButton>
      <ModeButton active={mode === 'matrix'} onClick={() => setMode('matrix')}>
        Matrix
      </ModeButton>
      <ModeButton active={mode === 'daily'} onClick={() => setMode('daily')}>
        Daily
      </ModeButton>
      <ModeButton active={mode === 'draw'} onClick={() => setMode('draw')}>
        Draw
      </ModeButton>
      <div className="flex-1" />
      <button
        onClick={openGlobalSearch}
        title="Search everything (⌘⇧F)"
        aria-label="Search everything"
        className="mr-1 flex items-center gap-1.5 rounded-md border border-gray-300 bg-gray-100 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-900 dark:hover:text-gray-300"
      >
        <span aria-hidden="true">🔍</span>
        <span className="hidden sm:inline">Search</span>
      </button>
      <button
        onClick={openCommandPalette}
        title="Command palette (⌘K)"
        className="flex items-center rounded-md border border-gray-300 bg-gray-100 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-900 dark:hover:text-gray-300"
      >
        ⌘K
      </button>
      <button
        onClick={openHelp}
        title="Help (⌘/)"
        className="flex items-center rounded-md border border-gray-300 bg-gray-100 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-900 dark:hover:text-gray-300"
      >
        ?
      </button>
      <button
        onClick={openSettings}
        title="Settings (⌘,)"
        className="flex items-center rounded-md border border-gray-300 bg-gray-100 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-900 dark:hover:text-gray-300"
      >
        ⚙
      </button>
    </header>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'rounded-md px-3 py-1 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-emerald-500',
        active
          ? 'bg-gray-200 text-gray-900 dark:bg-gray-800 dark:text-white'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-200',
      )}
    >
      {children}
    </button>
  );
}

// ── Notes main pane ──────────────────────────────────────────────────────────

function NotesMainPane(): JSX.Element {
  const selectedNoteId = useUI((s) => s.selectedNoteId);
  if (selectedNoteId === null) return <NotesEmptyState />;
  return <NoteEditor noteId={selectedNoteId} />;
}

/**
 * Empty state for the Notes main pane — shown when no note is selected.
 *
 * Acts as a second drag-and-drop import target (the sidebar is the primary
 * one). Having the full main pane as a drop zone makes the feature more
 * discoverable and gives a large drag surface.
 */
function NotesEmptyState(): JSX.Element {
  const createNote = useCreateNote();
  const setSelectedNoteId = useUI((s) => s.setSelectedNoteId);

  const [dropState, setDropState] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [importing, setImporting] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current !== 1) return;
    // getAsFile() returns null during dragenter in Electron's sandboxed
    // renderer — file names are only available on drop. Accept any file-kind
    // item optimistically; the real extension check runs in handleDrop.
    const hasFiles = Array.from(e.dataTransfer.items).some(
      (item) => item.kind === 'file',
    );
    setDropState(hasFiles ? 'valid' : 'invalid');
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = dropState === 'valid' ? 'copy' : 'none';
  }, [dropState]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setDropState('idle');
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setDropState('idle');
      if (dropState !== 'valid') return;

      setImporting(true);
      try {
        const results = await importDroppedFiles(e.dataTransfer);
        let lastCreatedId: string | null = null;
        for (const result of results) {
          if (!result.ok) continue;
          const created = await createNote.mutateAsync({
            title: result.note.title,
            body: result.note.body,
            bodyType: result.note.bodyType,
          });
          lastCreatedId = created.id;
        }
        if (lastCreatedId !== null) setSelectedNoteId(lastCreatedId);
      } finally {
        setImporting(false);
      }
    },
    [dropState, createNote, setSelectedNoteId],
  );

  return (
    <div
      className="relative flex h-full items-center justify-center"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => void handleDrop(e)}
    >
      {/* Drop overlay */}
      {dropState !== 'idle' && (
        <div
          className={clsx(
            'pointer-events-none absolute inset-4 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-colors',
            dropState === 'valid'
              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30'
              : 'border-red-700 bg-red-50/50 dark:bg-red-950/20',
          )}
        >
          <span className="text-4xl">
            {dropState === 'valid' ? '📄' : '⛔'}
          </span>
          <span
            className={clsx(
              'text-base font-medium',
              dropState === 'valid' ? 'text-emerald-300' : 'text-red-400',
            )}
          >
            {dropState === 'valid' ? 'Drop to import' : 'Unsupported file type'}
          </span>
          {dropState === 'valid' && (
            <span className="text-sm text-emerald-600">
              .md · .markdown · .html · .htm
            </span>
          )}
        </div>
      )}

      {importing && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-gray-950/60">
          <p className="text-sm text-gray-600 dark:text-gray-400">Importing…</p>
        </div>
      )}

      {dropState === 'idle' && !importing && (
        <div className="text-center">
          <h1 className="mb-3 text-3xl font-bold tracking-tight">Cinder</h1>
          <p className="mb-6 text-gray-500">
            Select a note from the sidebar, or press{' '}
            <kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
              ⌘N
            </kbd>{' '}
            to create one.
          </p>
          <div className="mx-auto flex max-w-xs flex-col items-center gap-1 rounded-xl border border-dashed border-gray-200 px-6 py-5 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-600">
            <span className="text-2xl">⬇</span>
            <span>Drop a file to import</span>
            <span className="text-xs text-gray-400 dark:text-gray-700">
              .md · .markdown · .html · .htm
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export the Mode type for any consumer that needs it (lint will tree-shake
// if it goes unused, but keeping the type colocated with the layout helps
// future router-style refactors).
export type { Mode };
