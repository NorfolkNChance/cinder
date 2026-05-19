import { create } from 'zustand';

/**
 * Client-side UI state (Zustand).
 *
 * Strictly local — anything that needs to survive a reload or be shared
 * with the main process belongs in TanStack Query (server state) or in
 * the DB, not here.
 */

interface UIState {
  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;
}

export const useUI = create<UIState>((set) => ({
  selectedNoteId: null,
  setSelectedNoteId: (id) => set({ selectedNoteId: id }),
}));
