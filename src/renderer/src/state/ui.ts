import { create } from 'zustand';
import type { MatrixPrefs } from '../../../shared/matrix/classify';
import { DEFAULT_MATRIX_PREFS } from '../../../shared/matrix/classify';

/**
 * Client-side UI state (Zustand).
 *
 * Strictly local — anything that needs to survive a reload or be shared
 * with the main process belongs in TanStack Query (server state) or in
 * the DB, not here.
 *
 * The store carries parallel "selections" — one for Notes mode
 * (selectedNoteId), one for Tasks mode (taskScope), and one for Matrix
 * mode (matrixPrefs + optional project/label filter). Switching between
 * modes doesn't clobber the other side's state.
 */

export type Mode = 'notes' | 'tasks' | 'matrix';

/**
 * The scope a Tasks-mode view is showing.
 *   - inbox: tasks with no project (project_id IS NULL)
 *   - today: tasks due on or before today (overdue + today, any project)
 *   - upcoming: tasks due tomorrow or later (any project)
 *   - project: all active tasks in a specific project
 *
 * Each scope maps to a TaskListInput filter — see features/tasks/queries.ts
 * for the translation. The renderer never encodes these conventions
 * directly.
 */
export type TaskScope =
  | { kind: 'inbox' }
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'project'; id: string }
  | { kind: 'label'; id: string }
  | { kind: 'filter'; id: string };

interface UIState {
  mode: Mode;
  setMode: (m: Mode) => void;

  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;

  taskScope: TaskScope;
  setTaskScope: (s: TaskScope) => void;

  /** Eisenhower matrix classification thresholds and optional scope filter. */
  matrixPrefs: MatrixPrefs;
  setMatrixPrefs: (prefs: Partial<MatrixPrefs>) => void;
  /** Optional project filter applied inside the matrix (null = all projects). */
  matrixProjectId: string | null;
  setMatrixProjectId: (id: string | null) => void;
  /** Optional label filter applied inside the matrix (null = all labels). */
  matrixLabelId: string | null;
  setMatrixLabelId: (id: string | null) => void;

  /** Whether the ⌘K command palette is open. */
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;

  /** Whether the help documentation overlay is open. */
  helpOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
}

export const useUI = create<UIState>((set) => ({
  mode: 'notes',
  setMode: (m) => set({ mode: m }),

  selectedNoteId: null,
  setSelectedNoteId: (id) => set({ selectedNoteId: id }),

  taskScope: { kind: 'inbox' },
  setTaskScope: (s) => set({ taskScope: s }),

  matrixPrefs: DEFAULT_MATRIX_PREFS,
  setMatrixPrefs: (prefs) =>
    set((s) => ({ matrixPrefs: { ...s.matrixPrefs, ...prefs } })),
  matrixProjectId: null,
  setMatrixProjectId: (id) => set({ matrixProjectId: id }),
  matrixLabelId: null,
  setMatrixLabelId: (id) => set({ matrixLabelId: id }),

  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),

  helpOpen: false,
  openHelp: () => set({ helpOpen: true }),
  closeHelp: () => set({ helpOpen: false }),
}));
