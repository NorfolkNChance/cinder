import { useEffect, useRef } from 'react';
import { useUI } from '../../state/ui';
import { useSettings } from './useSettings';
import type { AppSettings } from '../../../../shared/schemas/settings';
import { useFocusTrap } from '../../hooks/useFocusTrap';

// Type alias to avoid long signatures in sub-components.
type SetFn = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;

/**
 * Settings modal — opened with ⌘, or from the gear button in TopBar.
 *
 * Uses a two-column layout: a fixed-width sidebar of sections on the left,
 * a scrollable content pane on the right.
 *
 * Sections:
 *   - Matrix — urgency window, importance cutoff
 *   - Tasks  — default scope on startup, show completed toggle
 */
export function SettingsModal(): JSX.Element | null {
  const isOpen = useUI((s) => s.settingsOpen);
  const close = useUI((s) => s.closeSettings);
  const { settings, isLoading, set } = useSettings();
  const setMatrixPrefs = useUI((s) => s.setMatrixPrefs);
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, isOpen);

  // Wrap `set` to additionally push matrix-related changes into Zustand
  // so the Matrix view updates live while the settings panel is open.
  const setWithSync: SetFn = (key, value) => {
    set(key, value);
    if (key === 'matrix.urgencyDays') {
      setMatrixPrefs({ urgencyDays: value as number });
    } else if (key === 'matrix.importanceCutoff') {
      setMatrixPrefs({ importanceCutoff: value as 1 | 2 | 3 | 4 });
    }
  };

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
        className="flex h-[480px] w-[640px] overflow-hidden rounded-xl border border-gray-300 bg-gray-100 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        {/* Sidebar */}
        <nav className="w-44 flex-shrink-0 border-r border-gray-200 py-4 dark:border-gray-800">
          <p className="mb-3 px-4 text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-600">
            Settings
          </p>
          <SidebarItem label="Editor" icon="✏️" />
          <SidebarItem label="Appearance" icon="🎨" />
          <SidebarItem label="Notifications" icon="🔔" />
          <SidebarItem label="Backup" icon="💾" />
          <SidebarItem label="Daily Notes" icon="📅" />
          <SidebarItem label="Matrix" icon="🔲" />
          <SidebarItem label="Tasks" icon="✅" />
        </nav>

        {/* Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Settings</h2>
            <button
              onClick={close}
              aria-label="Close settings"
              className="text-gray-500 hover:text-gray-700 transition-colors dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {isLoading || !settings ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : (
              <>
                <EditorSection settings={settings} set={setWithSync} />
                <div className="my-6 border-t border-gray-200 dark:border-gray-800" />
                <AppearanceSection settings={settings} set={setWithSync} />
                <div className="my-6 border-t border-gray-200 dark:border-gray-800" />
                <NotificationsSection settings={settings} set={setWithSync} />
                <div className="my-6 border-t border-gray-200 dark:border-gray-800" />
                <BackupSection settings={settings} set={setWithSync} />
                <div className="my-6 border-t border-gray-200 dark:border-gray-800" />
                <DailyNotesSection settings={settings} set={setWithSync} />
                <div className="my-6 border-t border-gray-200 dark:border-gray-800" />
                <MatrixSection settings={settings} set={setWithSync} />
                <div className="my-6 border-t border-gray-200 dark:border-gray-800" />
                <TasksSection settings={settings} set={setWithSync} />
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-2 dark:border-gray-800">
            <span className="text-[11px] text-gray-500 dark:text-gray-600">
              Changes take effect immediately. Preferences are stored locally.
            </span>
            <button
              onClick={() => void window.api.update.check()}
              className="text-[11px] text-gray-500 underline transition-colors hover:text-gray-700 dark:text-gray-600 dark:hover:text-gray-400"
            >
              Check for updates
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar item ─────────────────────────────────────────────────────────────

function SidebarItem({ label, icon }: { label: string; icon: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

// ── Editor section ────────────────────────────────────────────────────────────

function EditorSection({
  settings,
  set,
}: {
  settings: AppSettings;
  set: SetFn;
}): JSX.Element {
  const spellcheck = settings['editor.spellcheck'];
  return (
    <section>
      <SectionHeading icon="✏️" title="Editor" />
      <Field
        label="Spell checking"
        description="Underline misspelled words using the macOS system spellchecker. Right-click a highlighted word for suggestions or to add it to your personal dictionary."
      >
        <button
          role="switch"
          aria-checked={spellcheck}
          onClick={() => set('editor.spellcheck', !spellcheck)}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900 ${
            spellcheck ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              spellcheck ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </Field>
    </section>
  );
}

// ── Appearance section ────────────────────────────────────────────────────────

function AppearanceSection({
  settings,
  set,
}: {
  settings: AppSettings;
  set: SetFn;
}): JSX.Element {
  const theme = settings['appearance.theme'];
  const options: Array<{ value: 'auto' | 'light' | 'dark'; label: string }> = [
    { value: 'auto', label: 'Auto' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  return (
    <section>
      <SectionHeading icon="🎨" title="Appearance" />
      <Field
        label="Theme"
        description="Controls the colour scheme. Auto follows your system setting."
      >
        <div
          role="radiogroup"
          aria-label="Theme"
          className="flex rounded-md border border-gray-300 divide-x divide-gray-300 dark:border-gray-700 dark:divide-gray-700"
        >
          {options.map(({ value, label }) => (
            <button
              key={value}
              role="radio"
              aria-checked={theme === value}
              onClick={() => set('appearance.theme', value)}
              className={`px-3 py-1 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 ${
                theme === value
                  ? 'bg-indigo-600 text-white rounded-md'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-md'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>
    </section>
  );
}

// ── Notifications section ─────────────────────────────────────────────────────

function NotificationsSection({
  settings,
  set,
}: {
  settings: AppSettings;
  set: SetFn;
}): JSX.Element {
  const enabled = settings['notifications.enabled'];
  return (
    <section>
      <SectionHeading icon="🔔" title="Notifications" />
      <Field
        label="Due-task alerts"
        description="Show a macOS notification when tasks are due today or overdue. Checks every 15 minutes while the app is running."
      >
        <button
          role="switch"
          aria-checked={enabled}
          onClick={() => set('notifications.enabled', !enabled)}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900 ${
            enabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </Field>
    </section>
  );
}

// ── Backup section ────────────────────────────────────────────────────────────

function BackupSection({
  settings,
  set,
}: {
  settings: AppSettings;
  set: SetFn;
}): JSX.Element {
  const autoOn = settings['backup.autoOnQuit'];
  const keepCount = settings['backup.keepCount'];

  return (
    <section>
      <SectionHeading icon="💾" title="Backup" />
      <p className="mb-4 text-[12px] text-gray-500 dark:text-gray-500">
        Your data is encrypted with AES-256 and stored in{' '}
        <span className="font-mono text-[11px]">~/Library/Application Support/Cinder/</span>.
        Time Machine backs this up automatically if enabled.
      </p>

      <Field
        label="Auto-backup on quit"
        description="Save an encrypted snapshot every time you close Cinder. Backups are stored in the Cinder data folder."
      >
        <button
          role="switch"
          aria-checked={autoOn}
          onClick={() => set('backup.autoOnQuit', !autoOn)}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900 ${
            autoOn ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              autoOn ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </Field>

      <Field
        label="Backups to keep"
        description="Older auto-backups are deleted automatically once this limit is reached."
      >
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            value={keepCount}
            onChange={(e) => set('backup.keepCount', Number(e.target.value))}
            className="w-28 accent-indigo-500"
            aria-label="Number of backups to keep"
            disabled={!autoOn}
          />
          <span className="w-8 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300">
            {keepCount}
          </span>
        </div>
      </Field>

      <div className="mt-1 flex items-center gap-3">
        <button
          onClick={() => void window.api.export.backup({})}
          className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
        >
          Back up now…
        </button>
        <button
          onClick={() => void window.api.export.keyBackup({})}
          className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
        >
          Export encryption key…
        </button>
      </div>
    </section>
  );
}

// ── Daily Notes section ───────────────────────────────────────────────────────

function DailyNotesSection({
  settings,
  set,
}: {
  settings: AppSettings;
  set: SetFn;
}): JSX.Element {
  const template = settings['daily.template'];

  return (
    <section>
      <SectionHeading icon="📅" title="Daily Notes" />
      <p className="mb-4 text-[12px] text-gray-500 dark:text-gray-500">
        Markdown written here is inserted into every new daily note. Existing notes are not affected.
      </p>
      <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1.5">
        Template
      </label>
      <textarea
        value={template}
        onChange={(e) => set('daily.template', e.target.value)}
        placeholder={'## Goals\n\n## Journal\n\n## Gratitude'}
        rows={8}
        spellCheck={false}
        className="w-full resize-y rounded border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-600"
        aria-label="Daily note template"
      />
    </section>
  );
}

// ── Matrix section ────────────────────────────────────────────────────────────

function MatrixSection({
  settings,
  set,
}: {
  settings: AppSettings;
  set: SetFn;
}): JSX.Element {
  return (
    <section>
      <SectionHeading icon="🔲" title="Eisenhower Matrix" />
      <p className="mb-4 text-[12px] text-gray-500 dark:text-gray-500">
        Controls how tasks are classified into the four quadrants.
      </p>

      <Field
        label="Urgency window"
        description="Tasks due within this many days are considered urgent. 0 = only tasks due today."
      >
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={14}
            step={1}
            value={settings['matrix.urgencyDays']}
            onChange={(e) =>
              set('matrix.urgencyDays', Number(e.target.value))
            }
            className="w-36 accent-indigo-500"
            aria-label="Urgency days"
          />
          <span className="w-8 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300">
            {settings['matrix.urgencyDays']}d
          </span>
        </div>
      </Field>

      <Field
        label="Importance cutoff"
        description="Tasks with priority ≤ this value are treated as important (P1 = highest)."
      >
        <select
          value={settings['matrix.importanceCutoff']}
          onChange={(e) =>
            set(
              'matrix.importanceCutoff',
              Number(e.target.value) as 1 | 2 | 3 | 4,
            )
          }
          className="rounded border border-gray-300 bg-gray-200 px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          aria-label="Importance cutoff"
        >
          <option value={1}>P1 only</option>
          <option value={2}>P1 – P2 (default)</option>
          <option value={3}>P1 – P3</option>
          <option value={4}>All priorities</option>
        </select>
      </Field>
    </section>
  );
}

// ── Tasks section ─────────────────────────────────────────────────────────────

function TasksSection({
  settings,
  set,
}: {
  settings: AppSettings;
  set: SetFn;
}): JSX.Element {
  return (
    <section>
      <SectionHeading icon="✅" title="Tasks" />

      <Field
        label="Default view on startup"
        description="Which task scope the sidebar opens to when you launch the app."
      >
        <select
          value={settings['tasks.defaultScope']}
          onChange={(e) =>
            set(
              'tasks.defaultScope',
              e.target.value as 'inbox' | 'today' | 'upcoming',
            )
          }
          className="rounded border border-gray-300 bg-gray-200 px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          aria-label="Default task scope"
        >
          <option value="inbox">Inbox</option>
          <option value="today">Today</option>
          <option value="upcoming">Upcoming</option>
        </select>
      </Field>

      <Field
        label="Show completed tasks"
        description="Include completed tasks in task lists by default."
      >
        <button
          role="switch"
          aria-checked={settings['tasks.showCompleted']}
          onClick={() =>
            set('tasks.showCompleted', !settings['tasks.showCompleted'])
          }
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900 ${
            settings['tasks.showCompleted'] ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              settings['tasks.showCompleted'] ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </Field>
    </section>
  );
}

// ── Shared layout helpers ─────────────────────────────────────────────────────

function SectionHeading({
  icon,
  title,
}: {
  icon: string;
  title: string;
}): JSX.Element {
  return (
    <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
      <span>{icon}</span>
      <span>{title}</span>
    </h3>
  );
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="mb-5 flex items-start justify-between gap-6">
      <div className="flex-1">
        <p className="text-sm text-gray-700 dark:text-gray-300">{label}</p>
        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-600">{description}</p>
      </div>
      <div className="flex-shrink-0 pt-0.5">{children}</div>
    </div>
  );
}
