import { useState, useEffect } from 'react';

/**
 * Help documentation content.
 *
 * Each section has an id, title, icon, and a `render` function that
 * returns JSX. Keeping content as React components gives full
 * formatting control (tables, code blocks, callouts) without needing
 * a markdown runtime in the renderer.
 *
 * The `keywords` array is used by the search filter — it extends the
 * set of strings that can match a section beyond just the title.
 */

export interface HelpSection {
  id: string;
  title: string;
  icon: string;
  keywords: string[];
  render: () => JSX.Element;
}

// ── Shared style helpers ─────────────────────────────────────────────────────

export function H2({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <h2 className="mb-3 mt-0 text-base font-semibold text-gray-900 dark:text-white">{children}</h2>
  );
}

export function H3({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <h3 className="mb-2 mt-5 text-sm font-semibold text-gray-700 dark:text-gray-300">{children}</h3>
  );
}

export function P({ children }: { children: React.ReactNode }): JSX.Element {
  return <p className="mb-3 leading-relaxed text-gray-600 dark:text-gray-400">{children}</p>;
}

export function Code({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <code className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-[12px] text-emerald-700 dark:bg-gray-800 dark:text-emerald-300">
      {children}
    </code>
  );
}

export function CodeBlock({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <pre className="mb-3 overflow-x-auto rounded-lg border border-gray-200 bg-gray-100 p-3 font-mono text-[12px] leading-relaxed text-emerald-700 dark:border-gray-800 dark:bg-gray-900 dark:text-emerald-300">
      {children}
    </pre>
  );
}

export function Kbd({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <kbd className="rounded border border-gray-400 bg-gray-200 px-1.5 py-0.5 font-mono text-[11px] text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
      {children}
    </kbd>
  );
}

export function Callout({
  children,
  type = 'info',
}: {
  children: React.ReactNode;
  type?: 'info' | 'tip';
}): JSX.Element {
  const styles =
    type === 'tip'
      ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
      : 'border-blue-800 bg-blue-950/30 text-blue-300';
  const icon = type === 'tip' ? '💡' : 'ℹ️';
  return (
    <div className={`mb-3 flex gap-2 rounded-lg border px-3 py-2.5 text-sm ${styles}`}>
      <span className="shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function ShortcutRow({
  keys,
  description,
}: {
  keys: string[];
  description: string;
}): JSX.Element {
  return (
    <tr className="border-b border-gray-200/60 dark:border-gray-800/60">
      <td className="py-1.5 pr-4">
        <span className="flex items-center gap-1">
          {keys.map((k, i) => (
            <span key={i} className="flex items-center gap-0.5">
              {i > 0 && <span className="text-gray-400 dark:text-gray-700">/</span>}
              <Kbd>{k}</Kbd>
            </span>
          ))}
        </span>
      </td>
      <td className="py-1.5 text-sm text-gray-600 dark:text-gray-400">{description}</td>
    </tr>
  );
}

function ShortcutTable({
  rows,
}: {
  rows: Array<{ keys: string[]; description: string }>;
}): JSX.Element {
  return (
    <table className="mb-4 w-full border-collapse">
      <tbody>
        {rows.map((row, i) => (
          <ShortcutRow key={i} keys={row.keys} description={row.description} />
        ))}
      </tbody>
    </table>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

export const HELP_SECTIONS: HelpSection[] = [
  // ── Quick Start ──────────────────────────────────────────────────────────
  {
    id: 'quick-start',
    title: 'Quick Start',
    icon: '🚀',
    keywords: ['overview', 'introduction', 'getting started', 'basics'],
    render: () => (
      <div>
        <H2>Quick Start</H2>
        <P>
          Cinder is a local-first notes and tasks app for macOS. All data is
          stored on your machine in an encrypted SQLite database — nothing
          leaves your device.
        </P>

        <H3>Four modes</H3>
        <P>
          Switch between{' '}
          <strong className="text-gray-800 dark:text-gray-200">Notes</strong>,{' '}
          <strong className="text-gray-800 dark:text-gray-200">Tasks</strong>,{' '}
          <strong className="text-gray-800 dark:text-gray-200">Matrix</strong>, and{' '}
          <strong className="text-gray-800 dark:text-gray-200">Daily</strong> using the buttons at
          the top. <Kbd>⌘K</Kbd> opens the command palette from anywhere.
        </P>

        <H3>Five things to try first</H3>
        <ol className="mb-3 ml-4 list-decimal space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
          <li>
            Press <Kbd>⌘N</Kbd> in Notes mode to create your first note.
          </li>
          <li>
            Switch to Tasks, press <Kbd>q</Kbd>, then type{' '}
            <Code>Buy milk tomorrow p2 #work</Code> and hit Enter.
          </li>
          <li>
            Select any task with <Kbd>↑↓</Kbd>, press <Kbd>e</Kbd> to edit it.
          </li>
          <li>
            Open Matrix mode to see all tasks sorted into quadrants.
          </li>
          <li>
            Switch to Daily and click <strong className="text-gray-800 dark:text-gray-200">Today →</strong> to open today&apos;s journal entry.
          </li>
        </ol>
      </div>
    ),
  },

  // ── Notes ────────────────────────────────────────────────────────────────
  {
    id: 'notes',
    title: 'Notes',
    icon: '📝',
    keywords: ['markdown', 'editor', 'tiptap', 'prosemirror', 'write', 'new note', 'search', 'attach', 'image', 'import', 'spellcheck', 'spell check', 'spelling', 'wiki link', 'wiki links', 'internal link', 'wikilink', '\[\[', 'inter-note'],
    render: () => (
      <div>
        <H2>Notes</H2>
        <P>
          Notes are stored as Markdown. The editor (TipTap / ProseMirror)
          renders a rich view while keeping plain text as the canonical format
          — your notes are never locked in a proprietary format.
        </P>

        <H3>Creating and managing</H3>
        <ShortcutTable
          rows={[
            { keys: ['⌘N'], description: 'Create a new note' },
            { keys: ['⌘⌫'], description: 'Delete the selected note' },
            { keys: ['↑↓'], description: 'Navigate the note list' },
            { keys: ['⌘S'], description: 'Save immediately (autosave also runs after 500 ms)' },
          ]}
        />

        <H3>Editor formatting</H3>
        <ShortcutTable
          rows={[
            { keys: ['⌘B'], description: 'Bold' },
            { keys: ['⌘I'], description: 'Italic' },
            { keys: ['⌘`'], description: 'Inline code' },
            { keys: ['⌘⇧X'], description: 'Strikethrough' },
            { keys: ['⌘⇧H'], description: 'Highlight' },
            { keys: ['# + Space'], description: 'Heading 1 (## for H2, ### for H3)' },
            { keys: ['- + Space'], description: 'Bullet list' },
            { keys: ['1. + Space'], description: 'Numbered list' },
            { keys: ['[ ] + Space'], description: 'Task / to-do list item' },
            { keys: ['> + Space'], description: 'Blockquote' },
            { keys: ['``` + Enter'], description: 'Code block' },
            { keys: ['--- + Enter'], description: 'Horizontal rule' },
          ]}
        />

        <H3>Search</H3>
        <P>
          The search bar at the top of the Notes sidebar does full-text search
          across all note titles and bodies. Results update as you type (with a
          short debounce). Click any result to open the note.
        </P>

        <H3>Attachments</H3>
        <P>
          Paste or drag an image directly into the editor to embed it. Images
          are stored in your app data folder and served via a private{' '}
          <Code>attachment://</Code> protocol — they never leave your machine.
        </P>

        <H3>Importing files</H3>
        <P>
          Drop <Code>.md</Code>, <Code>.markdown</Code>, <Code>.html</Code>, or{' '}
          <Code>.htm</Code> files onto the sidebar or the empty main pane to
          import them as notes. HTML files are automatically converted to
          Markdown via Turndown.
        </P>

        <H3>Capturing a task from a note</H3>
        <P>
          The <strong className="text-gray-800 dark:text-gray-200">+ Todo</strong> button in the
          editor toolbar creates a task linked to the current note and places
          it in the Triage queue — so it won't clutter Inbox until you decide
          what to do with it. See the <em>Triage &amp; Capture</em> section for details.
        </P>

        <H3>Wiki links (inter-note links)</H3>
        <P>
          Link notes together using Obsidian-style wiki link syntax. Type{' '}
          <Code>[[Note Title]]</Code> anywhere in the editor — the title is
          highlighted as a clickable link (blue, dotted underline).
        </P>
        <P>
          <strong className="text-gray-800 dark:text-gray-200">Clicking</strong> a wiki link
          will navigate to the linked note if it exists, or create it and navigate
          there if it doesn't. You can also use the pipe syntax{' '}
          <Code>[[Actual Title|Display Text]]</Code> to show different text than
          the target note's title.
        </P>
        <P>
          Wiki links round-trip through markdown correctly — they are stored as{' '}
          <Code>[[Title]]</Code> in the markdown body and rendered as styled
          spans in the editor. This means they work in exported <Code>.md</Code>{' '}
          files and survive import/export cycles.
        </P>

        <H3>Spell checking</H3>
        <P>
          Cinder uses the macOS system spellchecker (<Code>NSSpellChecker</Code>
          ) — the same engine used by TextEdit and Notes. Misspelled words are
          underlined with a red dotted line. Right-click any underlined word to
          see correction suggestions or to add the word to your personal
          dictionary. The personal dictionary is shared with all macOS apps.
        </P>
        <P>
          Spell checking respects your macOS language settings and works
          offline. Toggle it on or off in{' '}
          <strong className="text-gray-800 dark:text-gray-200">Settings → Editor</strong>.
        </P>

        <Callout type="tip">
          Note titles are taken from the first line of content. Keep your first
          line short and descriptive — it's what appears in the sidebar list.
        </Callout>
      </div>
    ),
  },

  // ── Daily Notes ──────────────────────────────────────────────────────────
  {
    id: 'daily-notes',
    title: 'Daily Notes',
    icon: '📅',
    keywords: ['daily', 'journal', 'diary', 'today', 'date', 'calendar', 'day'],
    render: () => (
      <div>
        <H2>Daily Notes</H2>
        <P>
          Daily Notes is a fourth mode (alongside Notes, Tasks, and Matrix)
          designed for journalling and day-by-day writing. Each calendar day gets
          exactly one note, created automatically the first time you open it.
        </P>

        <H3>Opening a day</H3>
        <P>
          Click the <strong className="text-gray-800 dark:text-gray-200">Daily</strong> button in
          the toolbar, then click{' '}
          <strong className="text-gray-800 dark:text-gray-200">Today →</strong> to open
          today&apos;s note. If no note exists for today, one is created instantly
          with the date as its title (e.g. <em>Wednesday, 27 May 2026</em>).
        </P>

        <H3>Navigating the sidebar tree</H3>
        <P>
          Past days with existing notes appear in a collapsible tree organised
          by year → month → day. Click any date row to open that note. The most
          recent year and month are expanded by default; older periods are
          collapsed.
        </P>

        <H3>How daily notes relate to regular notes</H3>
        <P>
          Daily notes are stored in the same database as regular notes but are
          kept entirely separate:
        </P>
        <ul className="mb-3 ml-4 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
          <li>They do <strong className="text-gray-700 dark:text-gray-300">not</strong> appear in the main Notes list.</li>
          <li>They <strong className="text-gray-700 dark:text-gray-300">are</strong> included in full-text search.</li>
          <li>They can be exported as <Code>.md</Code> files via the export menu.</li>
          <li>The <strong className="text-gray-700 dark:text-gray-300">+ Todo</strong> button works inside daily notes — triage tasks link back to the daily note they came from.</li>
        </ul>

        <H3>Daily note template</H3>
        <P>
          New daily notes can be pre-filled with a Markdown template. Go to{' '}
          <strong className="text-gray-800 dark:text-gray-200">Settings → Daily Notes</strong>{' '}
          (or click <strong className="text-gray-800 dark:text-gray-200">Edit template…</strong> at
          the bottom of the Daily sidebar) and write your template in the textarea.
          Common starting points: <Code>## Goals</Code>, <Code>## Journal</Code>,{' '}
          <Code>## Gratitude</Code>. The template is only applied to{' '}
          <em>new</em> notes — existing daily notes are never modified.
        </P>

        <Callout type="tip">
          There is one note per calendar day — clicking <strong className="text-gray-800 dark:text-gray-200">Today →</strong> always
          opens the same note regardless of how many times you click it. You
          cannot accidentally create duplicates.
        </Callout>
      </div>
    ),
  },

  // ── Tasks ────────────────────────────────────────────────────────────────
  {
    id: 'tasks',
    title: 'Tasks & Quick-Add',
    icon: '✅',
    keywords: ['todo', 'create', 'inbox', 'today', 'upcoming', 'quick add', 'nlp', 'natural language'],
    render: () => (
      <div>
        <H2>Tasks &amp; Quick-Add</H2>
        <P>
          The quick-add bar (press <Kbd>q</Kbd> to focus it) parses natural
          language as you type. A live preview shows what will be created before
          you press Enter.
        </P>

        <H3>Quick-add syntax</H3>
        <P>
          Tokens can appear anywhere in the input — order doesn't matter. The
          remaining text becomes the task title.
        </P>

        <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-100/50 dark:border-gray-800 dark:bg-gray-900/60">
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Token</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Example</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['p1 – p4', 'p1', 'Priority (P1 = highest, P4 = lowest)'],
                ['today / tomorrow', 'tomorrow', 'Due date shorthand'],
                ['next [weekday]', 'next monday', 'Due date next occurrence'],
                ['in N days/weeks', 'in 3 days', 'Relative due date'],
                ['[Month] [Day]', 'Jun 15', 'Specific date'],
                ['at [time]', 'at 5pm', 'Due time (appended to date)'],
                ['#[project]', '#work', 'Assign to a project'],
                ['@[label]', '@urgent', 'Attach a label'],
                ['every [freq]', 'every week', 'Set recurrence'],
              ].map(([token, ex, meaning]) => (
                <tr key={token} className="border-b border-gray-200/50 dark:border-gray-800/50">
                  <td className="px-3 py-1.5 font-mono text-[12px] text-emerald-300">{token}</td>
                  <td className="px-3 py-1.5 font-mono text-[12px] text-gray-600 dark:text-gray-400">{ex}</td>
                  <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H3>Examples</H3>
        <CodeBlock>{`Submit report tomorrow at 5pm p1 #work
  → title: "Submit report", due: tomorrow 17:00, P1, project: Work

Call dentist next tuesday @health
  → title: "Call dentist", due: next Tuesday, label: health

Weekly review every monday p2
  → title: "Weekly review", recurs: every Monday, P2`}</CodeBlock>

        <H3>Views</H3>
        <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 text-sm dark:border-gray-800">
          {[
            ['Inbox', 'Tasks with no project assigned'],
            ['Today', 'Tasks due today or overdue'],
            ['Upcoming', 'Tasks due tomorrow or later'],
            ['Project', 'All tasks in a specific project'],
            ['Label', 'All tasks with a specific label'],
            ['Filter', 'Tasks matching a saved DSL expression'],
          ].map(([view, desc]) => (
            <div key={view} className="flex gap-3 border-b border-gray-200/50 px-3 py-2 dark:border-gray-800/50">
              <span className="w-20 shrink-0 font-medium text-gray-700 dark:text-gray-300">{view}</span>
              <span className="text-gray-500">{desc}</span>
            </div>
          ))}
        </div>

        <Callout type="tip">
          When the quick-add bar is focused in Today view, the due date defaults
          to today. In a Project view it defaults to that project. No need to
          type the date or project name again.
        </Callout>
      </div>
    ),
  },

  // ── Triage & Capture ─────────────────────────────────────────────────────
  {
    id: 'triage',
    title: 'Triage & Capture',
    icon: '📥',
    keywords: ['triage', 'capture', 'quick capture', 'todo', 'tray', 'menu bar', 'global shortcut', 'acknowledge', 'discard', 'inbox'],
    render: () => (
      <div>
        <H2>Triage &amp; Capture</H2>
        <P>
          Triage is a holding area for newly captured tasks. Tasks land here
          before entering Inbox so you can add context (priority, due date,
          project) without interrupting what you were doing.
        </P>

        <H3>Two ways to capture a task</H3>
        <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 text-sm dark:border-gray-800">
          <div className="flex items-start gap-3 border-b border-gray-200/50 px-3 py-2.5 dark:border-gray-800/50">
            <span className="w-36 shrink-0 font-medium text-gray-700 dark:text-gray-300">+ Todo button</span>
            <span className="text-gray-500">Appears in the editor toolbar while writing a note. Creates a task linked to that note — the triage card shows a backlink so you can jump back.</span>
          </div>
          <div className="flex items-start gap-3 px-3 py-2.5">
            <span className="w-36 shrink-0 font-medium text-gray-700 dark:text-gray-300"><Kbd>⌘⇧Space</Kbd></span>
            <span className="text-gray-500">Global shortcut — works even when Cinder is in the background. Opens a lightweight popup from the macOS menu-bar tray icon. The same natural-language parser as quick-add is available here.</span>
          </div>
        </div>

        <H3>Triage view</H3>
        <P>
          In Tasks mode, click <strong className="text-gray-800 dark:text-gray-200">Triage</strong>{' '}
          in the sidebar (shown with an amber badge count when tasks are waiting).
          Each card lets you set title, description, priority, due date, and
          project before deciding what to do with it.
        </P>

        <H3>Acknowledge and Discard</H3>
        <ul className="mb-3 ml-4 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
          <li>
            <strong className="text-gray-700 dark:text-gray-300">Acknowledge</strong> — promotes the task into normal flow (Inbox, or its assigned project if you set one). It then appears in all normal views.
          </li>
          <li>
            <strong className="text-gray-700 dark:text-gray-300">Discard</strong> — hard-deletes the task. Use this for noise captures you decide you don't need.
          </li>
        </ul>

        <Callout type="tip">
          Triage tasks are completely invisible in Inbox, Today, Upcoming, Matrix,
          and saved filters until acknowledged — they won't pollute your normal
          workflow while they sit unprocessed.
        </Callout>
      </div>
    ),
  },

  // ── Export & Backup ──────────────────────────────────────────────────────
  {
    id: 'export',
    title: 'Export & Backup',
    icon: '💾',
    keywords: ['export', 'backup', 'csv', 'markdown', 'download', 'save', 'file'],
    render: () => (
      <div>
        <H2>Export &amp; Backup</H2>
        <P>
          All export and backup operations open a native macOS Save dialog — the
          app never reads or writes arbitrary file paths.
        </P>

        <H3>Export options</H3>
        <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 text-sm dark:border-gray-800">
          {[
            ['Export note', 'Save the currently open note as a .md file.'],
            ['Export all notes', 'Save every note as a .md file into a folder you choose. Filenames are collision-safe.'],
            ['Export tasks', 'Save all active tasks as a .csv file with project, labels, priority, recurrence, and date columns.'],
            ['Backup database', 'Copy the encrypted .db file to a location you choose. Restoring: replace the database file in the app data folder.'],
          ].map(([name, desc]) => (
            <div key={name} className="flex items-start gap-3 border-b border-gray-200/50 px-3 py-2 dark:border-gray-800/50 last:border-b-0">
              <span className="w-36 shrink-0 font-medium text-gray-700 dark:text-gray-300">{name}</span>
              <span className="text-gray-500">{desc}</span>
            </div>
          ))}
        </div>

        <H3>Accessing the export menu</H3>
        <P>
          Click the export icon in the toolbar, or press <Kbd>⌘K</Kbd> and
          search for "export".
        </P>

        <Callout>
          The database backup is the encrypted SQLite file. The encryption key
          lives in your macOS Keychain and is <strong className="text-blue-300">not</strong>{' '}
          included in the backup — keep a note of your device or ensure iCloud
          Keychain is syncing if you plan to restore on a new machine.
        </Callout>
      </div>
    ),
  },

  // ── Keyboard Shortcuts ───────────────────────────────────────────────────
  {
    id: 'shortcuts',
    title: 'Keyboard Shortcuts',
    icon: '⌨️',
    keywords: ['hotkey', 'keybinding', 'keyboard', 'shortcut'],
    render: () => (
      <div>
        <H2>Keyboard Shortcuts</H2>

        <H3>Global</H3>
        <ShortcutTable
          rows={[
            { keys: ['⌘K'], description: 'Open command palette' },
            { keys: ['⌘/'], description: 'Open this help panel' },
            { keys: ['?'], description: 'Open this help panel (when not typing)' },
          ]}
        />

        <H3>Notes mode</H3>
        <ShortcutTable
          rows={[
            { keys: ['⌘N'], description: 'New note' },
            { keys: ['⌘⌫'], description: 'Delete selected note' },
            { keys: ['↑', '↓'], description: 'Navigate note list' },
          ]}
        />

        <H3>Tasks mode</H3>
        <ShortcutTable
          rows={[
            { keys: ['q', '⌘N'], description: 'Focus the quick-add input' },
            { keys: ['↑', '↓'], description: 'Navigate task list' },
            { keys: ['e'], description: 'Edit selected task (title + description)' },
            { keys: ['1', '2', '3', '4'], description: 'Set priority on selected task' },
            { keys: ['Space'], description: 'Toggle complete / reopen' },
            { keys: ['Backspace', 'Delete'], description: 'Delete selected task' },
            { keys: ['Esc'], description: 'Clear selection / close edit mode' },
          ]}
        />

        <H3>Task edit mode</H3>
        <ShortcutTable
          rows={[
            { keys: ['Enter'], description: 'Save (from title field)' },
            { keys: ['Esc'], description: 'Cancel, discard changes' },
          ]}
        />

        <H3>Command palette</H3>
        <ShortcutTable
          rows={[
            { keys: ['↑', '↓'], description: 'Navigate commands' },
            { keys: ['Enter'], description: 'Execute highlighted command' },
            { keys: ['Esc'], description: 'Close palette' },
          ]}
        />

        <H3>Matrix mode</H3>
        <ShortcutTable
          rows={[
            { keys: ['Drag card'], description: 'Move task to a different quadrant' },
            { keys: ['Click card'], description: 'Open task detail side panel' },
            { keys: ['📷 Snapshot'], description: 'Freeze quadrant membership' },
            { keys: ['🔴 Live'], description: 'Resume live classification' },
          ]}
        />

        <H3>Daily mode</H3>
        <ShortcutTable
          rows={[
            { keys: ['Today →'], description: 'Open (or create) today\'s note' },
            { keys: ['Click date row'], description: 'Open that day\'s note' },
            { keys: ['▶ year / month'], description: 'Expand or collapse a group' },
          ]}
        />
      </div>
    ),
  },

  // ── Projects ─────────────────────────────────────────────────────────────
  {
    id: 'projects',
    title: 'Projects',
    icon: '📁',
    keywords: ['project', 'folder', 'organise', 'organize', 'group'],
    render: () => (
      <div>
        <H2>Projects</H2>
        <P>
          Projects group related tasks. A task can belong to at most one project.
          Tasks without a project live in the Inbox.
        </P>

        <H3>Creating a project</H3>
        <P>
          In the Tasks sidebar, click <strong className="text-gray-800 dark:text-gray-200">+ New project</strong> at
          the bottom of the Projects section. Type a name and press Enter.
        </P>

        <H3>Assigning tasks to a project</H3>
        <P>Three ways:</P>
        <ol className="mb-3 ml-4 list-decimal space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
          <li>
            Type <Code>#projectname</Code> in the quick-add bar — the parser
            matches against existing project names (case-insensitive).
          </li>
          <li>
            Navigate to the project's view in the sidebar first — the quick-add
            bar defaults to that project.
          </li>
          <li>
            Open edit mode (<Kbd>e</Kbd>) on an existing task and change the
            Project field in the Matrix detail panel.
          </li>
        </ol>

        <H3>Deleting a project</H3>
        <P>
          Hover a project in the sidebar and click ✕. Tasks in that project are
          moved to the Inbox (their <Code>projectId</Code> is set to null) —
          they are not deleted.
        </P>

        <Callout>
          Project names are matched by the quick-add parser. If two projects
          share a prefix, the longer match wins. Rename projects to keep them
          easily distinguishable.
        </Callout>
      </div>
    ),
  },

  // ── Labels ───────────────────────────────────────────────────────────────
  {
    id: 'labels',
    title: 'Labels',
    icon: '🏷️',
    keywords: ['label', 'tag', 'category', 'at sign', '@'],
    render: () => (
      <div>
        <H2>Labels</H2>
        <P>
          Labels are free-form tags. A task can have multiple labels. They
          complement projects — use projects for "what area of work" and labels
          for cross-cutting concerns like <Code>@urgent</Code>,{' '}
          <Code>@waiting</Code>, or <Code>@someday</Code>.
        </P>

        <H3>Creating a label</H3>
        <P>
          In the Tasks sidebar, open the Labels section and click{' '}
          <strong className="text-gray-800 dark:text-gray-200">+ New label</strong>. Type a name
          (without the <Code>@</Code>) and press Enter.
        </P>

        <H3>Attaching labels</H3>
        <P>
          In the quick-add bar, type <Code>@labelname</Code>. Multiple labels
          are supported — each gets its own <Code>@</Code> token.
        </P>
        <CodeBlock>{`Review PR @code @urgent tomorrow`}</CodeBlock>

        <H3>Label view</H3>
        <P>
          Click a label in the sidebar to see all tasks tagged with it, across
          all projects. You can also use it in the Filter DSL with{' '}
          <Code>@labelname</Code>.
        </P>

        <H3>Deleting a label</H3>
        <P>
          Hover a label and click ✕. The label is removed from all tasks that
          had it — tasks themselves are not deleted.
        </P>
      </div>
    ),
  },

  // ── Filter DSL ───────────────────────────────────────────────────────────
  {
    id: 'filter-dsl',
    title: 'Filter DSL',
    icon: '🔍',
    keywords: ['filter', 'dsl', 'expression', 'query', 'search', 'saved filter', 'syntax'],
    render: () => (
      <div>
        <H2>Filter DSL</H2>
        <P>
          Saved filters let you define reusable queries using a small expression
          language. Expressions are validated in real time as you type in the
          sidebar.
        </P>

        <H3>Atoms (basic building blocks)</H3>
        <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 text-sm dark:border-gray-800">
          {[
            ['today', 'Due today or overdue'],
            ['overdue', 'Due date is in the past'],
            ['no-date', 'Has no due date set'],
            ['p1 / p2 / p3 / p4', 'Specific priority level'],
            ['@label', 'Has the specified label'],
            ['#project', 'Belongs to the specified project'],
            ['completed', 'Task is marked complete'],
          ].map(([atom, desc]) => (
            <div key={atom} className="flex items-start gap-3 border-b border-gray-200/50 px-3 py-2 dark:border-gray-800/50">
              <code className="w-36 shrink-0 font-mono text-[12px] text-emerald-700 dark:text-emerald-300">{atom}</code>
              <span className="text-gray-600 dark:text-gray-400">{desc}</span>
            </div>
          ))}
        </div>

        <H3>Operators</H3>
        <ShortcutTable
          rows={[
            { keys: ['&'], description: 'AND — both conditions must be true' },
            { keys: ['|'], description: 'OR — either condition must be true' },
            { keys: ['!'], description: 'NOT — condition must be false' },
            { keys: ['( )'], description: 'Grouping — controls precedence' },
          ]}
        />
        <P>
          Precedence (highest to lowest): <Code>!</Code> → <Code>&amp;</Code>{' '}
          → <Code>|</Code>. Use parentheses when in doubt.
        </P>

        <H3>Examples</H3>
        <CodeBlock>{`today & p1
  → High-priority tasks due today or overdue

@work & overdue
  → Overdue tasks labelled @work

#personal & no-date
  → Personal project tasks with no due date

(p1 | p2) & !completed
  → Important tasks that aren't done yet

today | overdue
  → Everything that needs attention now`}</CodeBlock>

        <H3>Creating a saved filter</H3>
        <P>
          In the Tasks sidebar, expand the Filters section, type a name and an
          expression. A green checkmark confirms the expression is valid. Press
          Enter or click Save. The filter then appears in the sidebar like a
          built-in view.
        </P>

        <Callout type="tip">
          The <Code>completed</Code> atom bypasses the default "active tasks
          only" filter, letting you query completed tasks directly without
          changing any global setting.
        </Callout>
      </div>
    ),
  },

  // ── Recurring Tasks ──────────────────────────────────────────────────────
  {
    id: 'recurring',
    title: 'Recurring Tasks',
    icon: '↻',
    keywords: ['recurring', 'repeat', 'recurrence', 'rrule', 'schedule', 'every'],
    render: () => (
      <div>
        <H2>Recurring Tasks</H2>
        <P>
          Recurring tasks automatically reschedule to their next occurrence
          when you mark them complete. The recurrence rule is stored as an
          RFC 5545 RRULE string.
        </P>

        <H3>Setting recurrence in quick-add</H3>
        <P>
          Add an <Code>every …</Code> token to your quick-add input:
        </P>
        <CodeBlock>{`Team standup every weekday at 9am
Weekly review every monday p2
Pay rent every month
Take vitamins every day`}</CodeBlock>

        <H3>Supported frequencies</H3>
        <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 text-sm dark:border-gray-800">
          {[
            ['every day / daily', 'FREQ=DAILY'],
            ['every weekday', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
            ['every week / weekly', 'FREQ=WEEKLY'],
            ['every [weekday]', 'FREQ=WEEKLY;BYDAY=MO (etc.)'],
            ['every month / monthly', 'FREQ=MONTHLY'],
            ['every year / yearly', 'FREQ=YEARLY'],
          ].map(([phrase, rule]) => (
            <div key={phrase} className="flex items-start gap-3 border-b border-gray-200/50 px-3 py-2 dark:border-gray-800/50">
              <code className="w-44 shrink-0 font-mono text-[12px] text-emerald-700 dark:text-emerald-300">{phrase}</code>
              <code className="text-[12px] text-gray-500">{rule}</code>
            </div>
          ))}
        </div>

        <H3>How completion works</H3>
        <P>
          When you mark a recurring task complete, Cinder computes the next
          occurrence date from the RRULE and creates a fresh task copy with that
          date. The completed instance remains in the database (soft-deleted
          after 30 days) so your history is preserved.
        </P>

        <P>
          The <Code>↻</Code> symbol on a task row indicates recurrence. Hover
          it to see the human-readable description of the schedule.
        </P>

        <Callout>
          Recurring tasks always need a due date — the recurrence engine uses
          it as the anchor for computing the next occurrence. If you add{' '}
          <Code>every week</Code> without a date, the date defaults to today.
        </Callout>
      </div>
    ),
  },

  // ── Eisenhower Matrix ────────────────────────────────────────────────────
  {
    id: 'matrix',
    title: 'Eisenhower Matrix',
    icon: '🔲',
    keywords: ['matrix', 'eisenhower', 'quadrant', 'urgent', 'important', 'drag', 'snapshot'],
    render: () => (
      <div>
        <H2>Eisenhower Matrix</H2>
        <P>
          The Matrix view classifies all your active tasks into four quadrants
          based on urgency and importance — without requiring any extra data
          entry.
        </P>

        <H3>The four quadrants</H3>
        <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
          {[
            { q: 'Do', color: 'border-red-800 bg-red-950/30 text-red-300', desc: 'Urgent + Important. Act on these first.' },
            { q: 'Schedule', color: 'border-blue-800 bg-blue-950/30 text-blue-300', desc: 'Not Urgent + Important. Block time for these.' },
            { q: 'Delegate', color: 'border-orange-800 bg-orange-950/30 text-orange-300', desc: 'Urgent + Not Important. Handle quickly or hand off.' },
            { q: 'Eliminate', color: 'border-gray-300 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400', desc: 'Not Urgent + Not Important. Reconsider whether these are needed.' },
          ].map(({ q, color, desc }) => (
            <div key={q} className={`rounded-lg border p-2.5 ${color}`}>
              <div className="mb-1 font-semibold">{q}</div>
              <div className="text-xs opacity-80">{desc}</div>
            </div>
          ))}
        </div>

        <H3>Classification thresholds</H3>
        <P>
          Adjust both axes in the Matrix sidebar:
        </P>
        <ul className="mb-3 ml-4 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
          <li>
            <strong className="text-gray-700 dark:text-gray-300">Urgent within N days</strong> —
            tasks due today or within the next N days count as urgent. Default:
            0 (today + overdue only).
          </li>
          <li>
            <strong className="text-gray-700 dark:text-gray-300">Important up to P#</strong> —
            tasks with priority ≤ this threshold count as important. Default:
            P2 (P1 and P2 are important).
          </li>
        </ul>

        <H3>Drag and drop</H3>
        <P>
          Drag any task card to a different quadrant. Cinder computes the
          minimum change to land the task there:
        </P>
        <ul className="mb-3 ml-4 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
          <li>Moving to <strong className="text-gray-700 dark:text-gray-300">urgent</strong> → sets due date to today (if not already urgent)</li>
          <li>Moving to <strong className="text-gray-700 dark:text-gray-300">not urgent</strong> → clears the due date</li>
          <li>Moving to <strong className="text-gray-700 dark:text-gray-300">important</strong> → raises priority to the importance cutoff</li>
          <li>Moving to <strong className="text-gray-700 dark:text-gray-300">not important</strong> → lowers priority below the cutoff</li>
        </ul>
        <P>
          Diagonal moves (e.g. Eliminate → Do) change both axes and prompt a
          confirmation before committing.
        </P>

        <H3>Snapshot mode</H3>
        <P>
          Click the <strong className="text-gray-800 dark:text-gray-200">📷 Snapshot</strong>{' '}
          button to freeze quadrant membership. While a snapshot is active,
          live re-classification won't move cards as you drag — your intent
          is preserved. Click{' '}
          <strong className="text-gray-800 dark:text-gray-200">🔴 Live</strong> to resume.
        </P>

        <H3>Task detail panel</H3>
        <P>
          Click any task card to open a detail panel on the right. From there
          you can edit the title, priority, due date, project, and mark the
          task complete or delete it — without leaving the matrix.
        </P>
      </div>
    ),
  },

  // ── Command Palette ──────────────────────────────────────────────────────
  {
    id: 'command-palette',
    title: 'Command Palette',
    icon: '⌘',
    keywords: ['command palette', 'search', 'jump', 'navigate', 'cmdk'],
    render: () => (
      <div>
        <H2>Command Palette</H2>
        <P>
          Press <Kbd>⌘K</Kbd> from anywhere to open the command palette. Start
          typing to fuzzy-search across all available commands.
        </P>

        <H3>What's in the palette</H3>
        <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 text-sm dark:border-gray-800">
          {[
            ['Navigation', 'Switch to Notes, Tasks, or Matrix mode'],
            ['Task scopes', 'Jump to Inbox, Today, Upcoming'],
            ['Projects', 'Jump to any project view'],
            ['Labels', 'Jump to any label view'],
            ['Saved filters', 'Jump to any saved filter view'],
            ['New note', 'Create a new note (⌘N)'],
            ['Add task', 'Focus the quick-add bar (q)'],
          ].map(([name, desc]) => (
            <div key={name} className="flex items-start gap-3 border-b border-gray-200/50 px-3 py-2 dark:border-gray-800/50">
              <span className="w-32 shrink-0 font-medium text-gray-700 dark:text-gray-300">{name}</span>
              <span className="text-gray-500">{desc}</span>
            </div>
          ))}
        </div>

        <H3>Search behaviour</H3>
        <P>
          The palette uses fuzzy matching — you don't need to type exact words.
          Typing <Code>wrk</Code> will match "Work", "Network", etc. Consecutive
          matches and prefix matches score higher and appear first.
        </P>

        <H3>Keyboard navigation</H3>
        <ShortcutTable
          rows={[
            { keys: ['⌘K'], description: 'Open / close palette' },
            { keys: ['↑', '↓'], description: 'Move highlight' },
            { keys: ['Enter'], description: 'Execute highlighted command' },
            { keys: ['Esc'], description: 'Close without executing' },
          ]}
        />
      </div>
    ),
  },

  // ── Vault Import ─────────────────────────────────────────────────────────
  {
    id: 'vault-import',
    title: 'Vault Import',
    icon: '🗂️',
    keywords: ['vault', 'import', 'obsidian', 'attach', 'attachment', 'embed', 'backup'],
    render: function VaultImportSection() {
      return (
        <div>
          <H2>Import an Obsidian Vault</H2>
          <P>
            Cinder can import notes from an Obsidian vault. The import is a two-step
            process: first it scans the vault to show a full preview, then it
            writes the imported notes to the database. Nothing is written until
            you confirm in the preview.
          </P>

          <H3>How it works</H3>
          <ol className="mb-3 list-inside list-decimal space-y-1 text-sm text-gray-600 dark:text-gray-400">
            <li>Click <strong>File → Import Obsidian Vault…</strong>.</li>
            <li>Choose the vault folder (the root that contains <Code>.obsidian/</Code>).</li>
            <li>Review the preview: the scanner detects regular notes, daily notes, and attachments.</li>
            <li>Adjust options and click <strong>Import</strong>.</li>
          </ol>

          <H3>Import options</H3>
          <ul className="mb-3 list-inside list-disc space-y-1 text-sm text-gray-600 dark:text-gray-400">
            <li>
              <strong>Wiki links</strong> — convert <Code>[[Note Name]]</Code> to
              plain text, or leave them as-is.
            </li>
            <li>
              <strong>Folder prefix</strong> — prepend the Obsidian folder path to
              note titles (top-level folder only, full path, or none).
            </li>
            <li>
              <strong>Daily notes folder</strong> — the name of the folder where
              your daily notes live (default: <Code>Daily Notes</Code>).
            </li>
            <li>
              <strong>Import attachments</strong> — copy embedded images and PDFs
              (<Code>![[file.png]]</Code>) to Cinder&apos;s attachment storage and
              convert them to <Code>attachment://</Code> URLs. Turn this off if
              you only want the text content.
            </li>
          </ul>

          <Callout type="info">
            Attachments that can&apos;t be found (no matching file in the vault)
            or fail to copy are left as <Code>![[…]]</Code> in the note body so
            you can investigate after import.
          </Callout>
        </div>
      );
    },
  },

  // ── About ────────────────────────────────────────────────────────────────
  {
    id: 'about',
    title: 'About',
    icon: 'ℹ️',
    keywords: ['version', 'about', 'info', 'cinder', 'build', 'release'],
    render: function AboutSection() {
      const [version, setVersion] = useState<string | null>(null);

      useEffect(() => {
        void window.api.app.getVersion().then(setVersion);
      }, []);

      return (
        <div>
          <H2>About Cinder</H2>
          <P>
            A local-first notes and tasks app for macOS. All data is stored
            on your machine in an AES-256 encrypted SQLite database — no
            account, no server, nothing leaves your device.
          </P>

          <div className="mb-6 overflow-hidden rounded-lg border border-gray-200 text-sm dark:border-gray-800">
            {(
              [
                ['Version', version ?? '…'],
                ['Platform', 'macOS'],
                ['Storage', 'Encrypted SQLite (AES-256, SQLCipher)'],
                ['Key storage', 'macOS Keychain'],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="flex items-center gap-3 border-b border-gray-200/50 px-3 py-2 last:border-b-0 dark:border-gray-800/50"
              >
                <span className="w-28 shrink-0 font-medium text-gray-700 dark:text-gray-300">
                  {label}
                </span>
                <span
                  className={`font-mono text-[12px] ${
                    label === 'Version'
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>

          <Callout type="tip">
            Updates are delivered automatically in the background and
            verified against the code-signing certificate before
            installation. You&apos;ll see a banner at the bottom of the
            screen when a new version is ready to apply.
          </Callout>
        </div>
      );
    },
  },
];
