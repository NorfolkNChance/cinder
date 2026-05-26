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

        <H3>Two modes</H3>
        <P>
          Switch between <strong className="text-gray-800 dark:text-gray-200">Notes</strong> and{' '}
          <strong className="text-gray-800 dark:text-gray-200">Tasks</strong> using the buttons at
          the top, or open the{' '}
          <strong className="text-gray-800 dark:text-gray-200">Matrix</strong> for an Eisenhower
          view of your tasks. The keyboard shortcut{' '}
          <Kbd>⌘K</Kbd> opens the command palette from anywhere.
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
            Press <Kbd>⌘K</Kbd> and start typing to jump anywhere instantly.
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
    keywords: ['markdown', 'editor', 'tiptap', 'prosemirror', 'write', 'new note'],
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

        <Callout type="tip">
          Note titles are taken from the first line of content. Keep your first
          line short and descriptive — it's what appears in the sidebar list.
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
];
