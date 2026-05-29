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

export type Mode = 'notes' | 'tasks' | 'matrix' | 'daily';

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
  | { kind: 'triage' }
  | { kind: 'inbox' }
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'project'; id: string }
  | { kind: 'label'; id: string }
  | { kind: 'filter'; id: string };

interface UIState {
  mode: Mode;
  setMode: (m: Mode) => void;

  /** The note open in Notes mode. Independent from Daily mode's selection. */
  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;

  /** The note open in Daily mode. Independent from Notes mode's selection. */
  dailySelectedNoteId: string | null;
  setDailySelectedNoteId: (id: string | null) => void;

  /** The currently-selected YYYY-MM-DD date in Daily mode. null = none selected. */
  selectedDailyDate: string | null;
  setSelectedDailyDate: (date: string | null) => void;

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

  /** Whether the Settings modal is open. */
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;

  /**
   * Ephemeral toast notification (auto-dismissed).
   * null means nothing is showing.
   */
  toast: { id: number; message: string; kind: 'success' | 'error' } | null;
  showToast: (message: string, kind: 'success' | 'error') => void;
  clearToast: () => void;
}

export const useUI = create<UIState>((set) => ({
  mode: 'notes',
  setMode: (m) => set({ mode: m }),

  selectedNoteId: null,
  setSelectedNoteId: (id) => set({ selectedNoteId: id }),

  dailySelectedNoteId: null,
  setDailySelectedNoteId: (id) => set({ dailySelectedNoteId: id }),

  selectedDailyDate: null,
  setSelectedDailyDate: (date) => set({ selectedDailyDate: date }),

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

  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  toast: null,
  showToast: (message, kind) => {
    const id = Date.now();
    set({ toast: { id, message, kind } });
    // Auto-dismiss after 3.5 s. The clearToast guard on `id` prevents a
    // stale timeout from hiding a newer toast that arrived in the window.
    setTimeout(() => {
      set((s) =>
        s.toast?.id === id ? { toast: null } : s,
      );
    }, 3500);
  },
  clearToast: () => set({ toast: null }),
}));
