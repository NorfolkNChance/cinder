import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { searchHighlightKey } from './searchHighlight';

/**
 * Find-in-note bar (⌘F) for the TipTap editor.
 *
 * Drives the SearchHighlight extension: typing sets the term, ↵ / ⇧↵ (and
 * the up/down buttons) step through matches, Escape closes. The match count
 * ("3 / 12") is read reactively from the plugin state via useEditorState.
 *
 * The current match is scrolled into view by querying the decoration DOM
 * element the extension stamps with `.cinder-search-match-current` — this
 * avoids moving the editor selection, which would steal focus from the
 * find input.
 */
export function FindInNote({
  editor,
  onClose,
}: {
  editor: Editor;
  onClose: () => void;
}): JSX.Element {
  const [term, setTerm] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const s = searchHighlightKey.getState(e.state);
      return {
        count: s?.matches.length ?? 0,
        current: s?.current ?? -1,
      };
    },
  });
  const count = stats?.count ?? 0;
  const current = stats?.current ?? -1;

  // Focus + select the field whenever the bar mounts.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Push the term into the extension (debounce-free: matching is cheap and
  // immediate feedback matters for find).
  useEffect(() => {
    editor.commands.setSearchTerm(term);
  }, [editor, term]);

  // Clear highlights when the bar unmounts.
  useEffect(() => {
    return () => {
      editor.commands.clearSearch();
    };
  }, [editor]);

  // Scroll the active match into view as it changes.
  useEffect(() => {
    if (current < 0) return;
    const el = editor.view.dom.querySelector('.cinder-search-match-current');
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [editor, current, count]);

  const goNext = (): void => {
    editor.commands.nextSearchResult();
  };
  const goPrev = (): void => {
    editor.commands.prevSearchResult();
  };

  return (
    <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-4 py-1.5 dark:border-gray-800 dark:bg-gray-950">
      <span className="text-xs text-gray-500 dark:text-gray-500" aria-hidden="true">🔍</span>
      <input
        ref={inputRef}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) goPrev();
            else goNext();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="Find in note…"
        aria-label="Find in note"
        className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-500 focus:outline-none dark:text-gray-100 dark:placeholder-gray-600"
      />
      <span
        className="min-w-[3.5rem] text-right text-xs tabular-nums text-gray-500 dark:text-gray-500"
        aria-live="polite"
      >
        {term.trim() === '' ? '' : count === 0 ? 'No results' : `${current + 1} / ${count}`}
      </span>
      <button
        type="button"
        onClick={goPrev}
        disabled={count === 0}
        aria-label="Previous match"
        title="Previous match (⇧↵)"
        className="rounded px-1.5 py-0.5 text-sm text-gray-500 hover:bg-gray-200 hover:text-gray-800 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={goNext}
        disabled={count === 0}
        aria-label="Next match"
        title="Next match (↵)"
        className="rounded px-1.5 py-0.5 text-sm text-gray-500 hover:bg-gray-200 hover:text-gray-800 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      >
        ↓
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close find"
        title="Close (Esc)"
        className="rounded px-1.5 py-0.5 text-sm text-gray-500 hover:bg-gray-200 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      >
        ✕
      </button>
    </div>
  );
}
