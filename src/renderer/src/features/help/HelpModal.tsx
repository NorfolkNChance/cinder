import { useState, useEffect, useRef, useMemo } from 'react';
import { useUI } from '../../state/ui';
import { HELP_SECTIONS, type HelpSection } from './helpContent';
import { useFocusTrap } from '../../hooks/useFocusTrap';

/**
 * In-app help documentation overlay.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────┐
 *   │  [ Search… ]                           [✕]  │
 *   ├──────────────┬──────────────────────────────┤
 *   │  TOC sidebar │  Section content             │
 *   │              │  (scrollable)                │
 *   └──────────────┴──────────────────────────────┘
 *
 * Opened by: ⌘/ · ? key (when not in an editable context) · ? button
 * in TopBar. Closed by: Esc · clicking the backdrop · ✕.
 */
export function HelpModal(): JSX.Element | null {
  const isOpen = useUI((s) => s.helpOpen);
  const close = useUI((s) => s.closeHelp);

  const [query, setQuery] = useState('');
  const [activeSectionId, setActiveSectionId] = useState(
    HELP_SECTIONS[0]?.id ?? '',
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, isOpen);

  // Reset on open (focus trap handles focus)
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveSectionId(HELP_SECTIONS[0]?.id ?? '');
    }
  }, [isOpen]);

  // Filter sections by search query
  const visibleSections = useMemo<HelpSection[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return HELP_SECTIONS;
    return HELP_SECTIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.keywords.some((k) => k.includes(q)),
    );
  }, [query]);

  // Keep active section valid when filter changes
  useEffect(() => {
    if (!visibleSections.some((s) => s.id === activeSectionId)) {
      setActiveSectionId(visibleSections[0]?.id ?? '');
    }
  }, [visibleSections, activeSectionId]);

  // Scroll content to top when active section changes
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeSectionId]);

  const activeSection = HELP_SECTIONS.find((s) => s.id === activeSectionId);

  if (!isOpen) return null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/[0.65]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* Panel */}
      <div
        ref={panelRef}
        className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-300 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-950"
        role="dialog"
        aria-label="Help documentation"
        aria-modal="true"
      >
        {/* Header — search + close */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <span className="text-gray-500">?</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                const idx = visibleSections.findIndex(
                  (s) => s.id === activeSectionId,
                );
                const next = visibleSections[idx + 1];
                if (next) setActiveSectionId(next.id);
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                const idx = visibleSections.findIndex(
                  (s) => s.id === activeSectionId,
                );
                const prev = visibleSections[idx - 1];
                if (prev) setActiveSectionId(prev.id);
              }
            }}
            placeholder="Search documentation…"
            aria-label="Search help"
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-500 focus:outline-none dark:text-gray-100 dark:placeholder-gray-600"
          />
          <button
            onClick={close}
            aria-label="Close help"
            className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1">
          {/* TOC sidebar */}
          <nav
            className="flex w-48 shrink-0 flex-col overflow-y-auto border-r border-gray-200 py-2 dark:border-gray-800"
            aria-label="Help sections"
          >
            {visibleSections.length === 0 ? (
              <p className="px-4 py-3 text-xs text-gray-600">
                No matches for "{query}"
              </p>
            ) : (
              visibleSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSectionId(section.id)}
                  className={`flex items-center gap-2 px-4 py-2 text-left text-sm transition ${
                    section.id === activeSectionId
                      ? 'bg-gray-200 text-gray-900 dark:bg-gray-800 dark:text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-900/60 dark:hover:text-gray-200'
                  }`}
                >
                  <span className="w-4 text-center text-base leading-none">
                    {section.icon}
                  </span>
                  <span className="truncate">{section.title}</span>
                </button>
              ))
            )}
          </nav>

          {/* Section content */}
          <div
            ref={contentRef}
            className="flex-1 overflow-y-auto px-8 py-6 text-sm"
          >
            {activeSection !== undefined ? (
              <activeSection.render />
            ) : (
              <p className="text-gray-600">Select a section.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-gray-200 px-4 py-2 text-[11px] text-gray-500 dark:border-gray-800 dark:text-gray-600">
          <span>
            <kbd className="font-mono">↑↓</kbd> navigate sections
          </span>
          <span>
            <kbd className="font-mono">esc</kbd> close
          </span>
          <span className="ml-auto">
            Press <kbd className="font-mono">⌘/</kbd> or{' '}
            <kbd className="font-mono">?</kbd> to open
          </span>
        </div>
      </div>
    </div>
  );
}
