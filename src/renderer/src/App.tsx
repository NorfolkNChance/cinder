import clsx from 'clsx';
import { NoteList } from './features/notes/NoteList';
import { NoteEditor } from './features/notes/NoteEditor';
import { TasksSidebar } from './features/tasks/TasksSidebar';
import { TaskList } from './features/tasks/TaskList';
import { useUI, type Mode } from './state/ui';

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

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-white">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <aside className="flex h-full w-72 flex-col border-r border-gray-800 bg-gray-950">
          {mode === 'notes' ? <NoteList /> : <TasksSidebar />}
        </aside>
        <main className="min-w-0 flex-1 overflow-hidden">
          {mode === 'notes' ? <NotesMainPane /> : <TaskList />}
        </main>
      </div>
    </div>
  );
}

// ── Top bar ─────────────────────────────────────────────────────────────────

function TopBar(): JSX.Element {
  const mode = useUI((s) => s.mode);
  const setMode = useUI((s) => s.setMode);

  return (
    <header className="flex items-center gap-1 border-b border-gray-800 px-3 py-1.5">
      <ModeButton active={mode === 'notes'} onClick={() => setMode('notes')}>
        Notes
      </ModeButton>
      <ModeButton active={mode === 'tasks'} onClick={() => setMode('tasks')}>
        Tasks
      </ModeButton>
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
          ? 'bg-gray-800 text-white'
          : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200',
      )}
    >
      {children}
    </button>
  );
}

// ── Notes main pane (existing behaviour, lifted out so the layout is symmetric) ─

function NotesMainPane(): JSX.Element {
  const selectedNoteId = useUI((s) => s.selectedNoteId);
  if (selectedNoteId === null) return <NotesEmptyState />;
  return <NoteEditor noteId={selectedNoteId} />;
}

function NotesEmptyState(): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h1 className="mb-3 text-3xl font-bold tracking-tight">Cinder</h1>
        <p className="text-gray-500">
          Select a note from the sidebar, or press{' '}
          <kbd className="rounded border border-gray-700 bg-gray-900 px-1.5 py-0.5 font-mono text-xs">
            ⌘N
          </kbd>{' '}
          to create one.
        </p>
      </div>
    </div>
  );
}

// Re-export the Mode type for any consumer that needs it (lint will tree-shake
// if it goes unused, but keeping the type colocated with the layout helps
// future router-style refactors).
export type { Mode };
