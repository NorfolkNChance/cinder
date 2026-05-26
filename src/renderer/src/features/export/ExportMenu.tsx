import { useState, useEffect, useRef } from 'react';
import { useExport } from './useExport';

interface ExportMenuProps {
  /** The currently-open note. When provided, "Export this note" is shown. */
  noteId?: string;
}

/**
 * Small ↑ button that opens a pop-over menu with export actions relevant
 * to the current context (single note, all notes, tasks CSV, backup).
 *
 * Closes on outside click, Escape, or after an action is selected.
 */
export function ExportMenu({ noteId }: ExportMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { exportNote, exportAllNotes, exportTasks, exportBackup } = useExport();

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const run = (action: () => Promise<void>): void => {
    setOpen(false);
    void action();
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Export"
        aria-label="Export options"
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors dark:hover:bg-gray-800 dark:hover:text-gray-300"
      >
        <span aria-hidden="true">↑</span>
        <span>Export</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-lg border border-gray-300 bg-gray-100 shadow-xl dark:border-gray-700 dark:bg-gray-900"
        >
          {noteId !== undefined && (
            <MenuItem
              icon="📄"
              label="Export this note…"
              description=".md file"
              onClick={() => run(() => exportNote({ noteId }))}
            />
          )}
          <MenuItem
            icon="📁"
            label="Export all notes…"
            description="folder of .md files"
            onClick={() => run(exportAllNotes)}
          />
          <div className="my-1 border-t border-gray-200 dark:border-gray-800" />
          <MenuItem
            icon="📊"
            label="Export tasks as CSV…"
            description="all active tasks"
            onClick={() => run(() => exportTasks({}))}
          />
          <div className="my-1 border-t border-gray-200 dark:border-gray-800" />
          <MenuItem
            icon="💾"
            label="Back up database…"
            description=".db snapshot"
            onClick={() => run(exportBackup)}
          />
        </div>
      )}
    </div>
  );
}

// ── MenuItem ─────────────────────────────────────────────────────────────────

function MenuItem({
  icon,
  label,
  description,
  onClick,
}: {
  icon: string;
  label: string;
  description: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-200 transition-colors dark:text-gray-300 dark:hover:bg-gray-800"
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="flex-1">
        <span className="block">{label}</span>
        <span className="block text-[11px] text-gray-500 dark:text-gray-600">{description}</span>
      </span>
    </button>
  );
}
