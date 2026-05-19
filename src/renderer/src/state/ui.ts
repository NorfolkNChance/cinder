import { create } from 'zustand';

/**
 * Client-side UI state (Zustand).
 *
 * Strictly local — anything that needs to survive a reload or be shared
 * with the main process belongs in TanStack Query (server state) or in
 * the DB, not here.
 *
 * The store carries two parallel "selections" — one for Notes mode
 * (selectedNoteId) and one for Tasks mode (taskScope). Switching
 * between modes doesn't clobber the other side's selection, so the
 * user returns to whatever they were looking at last in each mode.
 */

export type Mode = 'notes' | 'tasks';

/**
 * The scope a Tasks-mode view is showing. The Inbox view is tasks with
 * no project (project_id IS NULL — see services/tasks.ts). Today /
 * Upcoming smart views are added in milestone 2.3.
 */
export type TaskScope =
  | { kind: 'inbox' }
  | { kind: 'project'; id: string };

interface UIState {
  mode: Mode;
  setMode: (m: Mode) => void;

  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;

  taskScope: TaskScope;
  setTaskScope: (s: TaskScope) => void;
}

export const useUI = create<UIState>((set) => ({
  mode: 'notes',
  setMode: (m) => set({ mode: m }),

  selectedNoteId: null,
  setSelectedNoteId: (id) => set({ selectedNoteId: id }),

  taskScope: { kind: 'inbox' },
  setTaskScope: (s) => set({ taskScope: s }),
}));
