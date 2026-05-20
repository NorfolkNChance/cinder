import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { useUI } from '../../state/ui';
import {
  useProjectsList,
  useLabelsList,
  useSavedFiltersList,
} from '../tasks/queries';

/**
 * ⌘K Command palette.
 *
 * Opens as a modal overlay from anywhere in the app. Supports:
 *   - Navigation: jump to Notes, Tasks scopes (Inbox/Today/Upcoming),
 *     specific projects, labels, and saved filters
 *   - Mode switching between Notes and Tasks
 *   - Quick-actions: new note (⌘N), focus task quick-add
 *
 * Design notes:
 *   - Zero external dependencies — fuzzy scoring is a simple subsequence
 *     match; good enough for the item counts this app sees.
 *   - The palette subscribes to the same cached data the sidebar already
 *     holds (projects, labels, filters), so there are no extra fetches.
 *   - Keyboard: ↑/↓ navigate, Enter executes, Escape closes.
 */

// ── Types ────────────────────────────────────────────────────────────────────

type CommandGroup = 'Navigation' | 'Tasks' | 'Actions';

interface Command {
  id: string;
  group: CommandGroup;
  label: string;
  /** Short descriptor shown to the right of the label */
  hint?: string;
  icon: string; // emoji / single-char icon
  execute: () => void;
}

// ── Fuzzy match ──────────────────────────────────────────────────────────────

/**
 * Returns a score ≥ 0 if `query` is a subsequence of `text` (case-
 * insensitive), higher = better match. Returns -1 on no match.
 *
 * Consecutive matches and prefix matches score higher.
 */
function fuzzyScore(text: string, query: string): number {
  if (query.length === 0) return 0;
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  // Exact substring → best score
  if (t.includes(q)) return 100 + (t.startsWith(q) ? 50 : 0);

  // Subsequence check
  let ti = 0;
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) {
      score += 1 + consecutive * 2;
      consecutive++;
      qi++;
    } else {
      consecutive = 0;
    }
    ti++;
  }
  return qi === q.length ? score : -1;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CommandPalette(): JSX.Element | null {
  const isOpen = useUI((s) => s.commandPaletteOpen);
  const close = useUI((s) => s.closeCommandPalette);
  const setMode = useUI((s) => s.setMode);
  const setTaskScope = useUI((s) => s.setTaskScope);
  const setSelectedNoteId = useUI((s) => s.setSelectedNoteId);

  const { data: projects } = useProjectsList();
  const { data: labels } = useLabelsList();
  const { data: savedFilters } = useSavedFiltersList();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Focus the input when the palette opens; reset query/selection.
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      // Defer to let the DOM render first.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Build the full command list from current data.
  const allCommands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];

    // ── Navigation ──
    cmds.push({
      id: 'nav:notes',
      group: 'Navigation',
      label: 'Notes',
      hint: 'Switch mode',
      icon: '📝',
      execute: () => {
        setMode('notes');
        close();
      },
    });
    cmds.push({
      id: 'nav:tasks',
      group: 'Navigation',
      label: 'Tasks',
      hint: 'Switch mode',
      icon: '✅',
      execute: () => {
        setMode('tasks');
        close();
      },
    });

    // ── Task scopes ──
    cmds.push({
      id: 'scope:inbox',
      group: 'Tasks',
      label: 'Inbox',
      hint: 'Tasks',
      icon: '📥',
      execute: () => {
        setMode('tasks');
        setTaskScope({ kind: 'inbox' });
        close();
      },
    });
    cmds.push({
      id: 'scope:today',
      group: 'Tasks',
      label: 'Today',
      hint: 'Tasks',
      icon: '☀️',
      execute: () => {
        setMode('tasks');
        setTaskScope({ kind: 'today' });
        close();
      },
    });
    cmds.push({
      id: 'scope:upcoming',
      group: 'Tasks',
      label: 'Upcoming',
      hint: 'Tasks',
      icon: '📅',
      execute: () => {
        setMode('tasks');
        setTaskScope({ kind: 'upcoming' });
        close();
      },
    });

    // ── Projects ──
    for (const p of projects ?? []) {
      cmds.push({
        id: `project:${p.id}`,
        group: 'Tasks',
        label: p.name,
        hint: 'Project',
        icon: '📁',
        execute: () => {
          setMode('tasks');
          setTaskScope({ kind: 'project', id: p.id });
          close();
        },
      });
    }

    // ── Labels ──
    for (const l of labels ?? []) {
      cmds.push({
        id: `label:${l.id}`,
        group: 'Tasks',
        label: `@${l.name}`,
        hint: 'Label',
        icon: '🏷️',
        execute: () => {
          setMode('tasks');
          setTaskScope({ kind: 'label', id: l.id });
          close();
        },
      });
    }

    // ── Saved filters ──
    for (const f of savedFilters ?? []) {
      cmds.push({
        id: `filter:${f.id}`,
        group: 'Tasks',
        label: f.name,
        hint: 'Filter',
        icon: '🔍',
        execute: () => {
          setMode('tasks');
          setTaskScope({ kind: 'filter', id: f.id });
          close();
        },
      });
    }

    // ── Quick actions ──
    cmds.push({
      id: 'action:new-note',
      group: 'Actions',
      label: 'New note',
      hint: '⌘N',
      icon: '✏️',
      execute: () => {
        setMode('notes');
        setSelectedNoteId(null);
        close();
        // Dispatch the same synthetic event that ⌘N fires in NoteList
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'n',
          metaKey: true,
          bubbles: true,
        }));
      },
    });
    cmds.push({
      id: 'action:quick-add',
      group: 'Actions',
      label: 'Add task',
      hint: 'q',
      icon: '➕',
      execute: () => {
        setMode('tasks');
        close();
        // After close re-render, fire the 'q' shortcut to focus the quick-add
        requestAnimationFrame(() => {
          document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'q',
            bubbles: true,
          }));
        });
      },
    });

    return cmds;
  }, [projects, labels, savedFilters, setMode, setTaskScope, setSelectedNoteId, close]);

  // Filter + rank against the current query.
  const filtered = useMemo<Command[]>(() => {
    if (query.trim().length === 0) return allCommands;
    return allCommands
      .map((cmd) => ({
        cmd,
        score: fuzzyScore(`${cmd.label} ${cmd.hint ?? ''} ${cmd.group}`, query),
      }))
      .filter(({ score }) => score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(({ cmd }) => cmd);
  }, [allCommands, query]);

  // Clamp active index whenever the filtered list changes.
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // Scroll active item into view.
  useEffect(() => {
    const li = listRef.current?.children[activeIndex];
    li?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const execute = useCallback(
    (index: number) => {
      filtered[index]?.execute();
    },
    [filtered],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          execute(activeIndex);
          break;
        case 'Escape':
          e.preventDefault();
          close();
          break;
      }
    },
    [filtered.length, activeIndex, execute, close],
  );

  if (!isOpen) return null;

  // Group the filtered list for rendering headers.
  const groups = groupCommands(filtered);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onMouseDown={(e) => {
        // Close when clicking the backdrop (not the panel).
        if (e.target === e.currentTarget) close();
      }}
      style={{ background: 'rgba(0,0,0,0.6)' }}
    >
      {/* Panel */}
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
      >
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-gray-700 px-4 py-3">
          <span className="text-gray-500">⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search commands and navigation…"
            aria-label="Command palette search"
            className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-600 focus:outline-none"
          />
          {query.length > 0 && (
            <button
              onClick={() => setQuery('')}
              className="text-xs text-gray-600 hover:text-gray-400"
            >
              clear
            </button>
          )}
        </div>

        {/* Results */}
        <ul
          ref={listRef}
          className="max-h-80 overflow-y-auto py-1"
          role="listbox"
          aria-label="Commands"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-gray-600">
              No commands match "{query}"
            </li>
          ) : (
            groups.map(({ group, commands }) => (
              <CommandGroup
                key={group}
                group={group}
                commands={commands}
                allFiltered={filtered}
                activeIndex={activeIndex}
                setActiveIndex={setActiveIndex}
                execute={execute}
              />
            ))
          )}
        </ul>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t border-gray-800 px-4 py-2 text-[11px] text-gray-600">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

// ── Grouping helper ──────────────────────────────────────────────────────────

interface GroupedCommands {
  group: CommandGroup;
  commands: Command[];
}

function groupCommands(commands: Command[]): GroupedCommands[] {
  const map = new Map<CommandGroup, Command[]>();
  for (const cmd of commands) {
    const arr = map.get(cmd.group) ?? [];
    arr.push(cmd);
    map.set(cmd.group, arr);
  }
  return Array.from(map.entries()).map(([group, cmds]) => ({
    group,
    commands: cmds,
  }));
}

// ── Sub-components ───────────────────────────────────────────────────────────

function CommandGroup({
  group,
  commands,
  allFiltered,
  activeIndex,
  setActiveIndex,
  execute,
}: {
  group: CommandGroup;
  commands: Command[];
  allFiltered: Command[];
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  execute: (i: number) => void;
}): JSX.Element {
  return (
    <>
      <li
        className="px-4 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-widest text-gray-600"
        role="presentation"
      >
        {group}
      </li>
      {commands.map((cmd) => {
        const globalIndex = allFiltered.indexOf(cmd);
        const isActive = globalIndex === activeIndex;
        return (
          <li
            key={cmd.id}
            role="option"
            aria-selected={isActive}
            onMouseEnter={() => setActiveIndex(globalIndex)}
            onClick={() => execute(globalIndex)}
            className={`flex cursor-pointer items-center gap-3 px-4 py-2 text-sm ${
              isActive
                ? 'bg-gray-800 text-white'
                : 'text-gray-300 hover:bg-gray-800/50'
            }`}
          >
            <span className="w-5 text-center text-base leading-none">
              {cmd.icon}
            </span>
            <span className="flex-1">{cmd.label}</span>
            {cmd.hint !== undefined && (
              <span className="text-xs text-gray-600">{cmd.hint}</span>
            )}
          </li>
        );
      })}
    </>
  );
}
