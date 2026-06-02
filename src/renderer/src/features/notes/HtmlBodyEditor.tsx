import { useState } from 'react';
import clsx from 'clsx';

interface HtmlBodyEditorProps {
  /** Raw HTML content. */
  html: string;
  /** Called whenever the source is edited. Feeds into NoteEditor's autosave. */
  onChange: (html: string) => void;
}

/**
 * Body editor for notes with bodyType === 'html'.
 *
 * Two modes toggled by a tab bar:
 *
 *   Preview  — renders the HTML in a sandboxed iframe (no JavaScript,
 *               same-origin so attachment:// images work). The user sees
 *               the page exactly as a browser would display it.
 *
 *   Source   — a plain textarea showing the raw HTML. Changes are fed to
 *               NoteEditor's debounced autosave via onChange, so ⌘S and
 *               the "Saved / Unsaved…" indicator all work normally.
 *
 * Security:
 *   The iframe uses sandbox="allow-same-origin" which permits CSS and
 *   same-origin resources (attachment:// images) but blocks all JavaScript
 *   execution. The app's own CSP further restricts any external resource
 *   loading. dangerouslySetInnerHTML is intentionally NOT used.
 */
export function HtmlBodyEditor({ html, onChange }: HtmlBodyEditorProps): JSX.Element {
  const [mode, setMode] = useState<'preview' | 'source'>('preview');

  return (
    <div className="flex h-full flex-col">
      {/* Mode toggle bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-gray-200 px-4 py-1.5 dark:border-gray-800">
        <ModeTab
          label="Preview"
          icon="👁"
          active={mode === 'preview'}
          onClick={() => setMode('preview')}
        />
        <ModeTab
          label="Source"
          icon="</>"
          active={mode === 'source'}
          onClick={() => setMode('source')}
        />
        <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-600">
          HTML note
        </span>
      </div>

      {/* Content area */}
      {mode === 'preview' ? (
        <iframe
          // srcdoc renders the HTML inline — no external URL, no navigation.
          //
          // Sandbox is intentionally empty (fully restrictive):
          //   - No allow-scripts → JS and event handlers are blocked.
          //   - No allow-same-origin → the frame gets a null origin, which
          //     also prevents <meta http-equiv="refresh"> navigation (that
          //     tag fires without scripts but requires same-origin to reach
          //     the parent's browsing context).
          //   - attachment:// images continue to load because the Electron
          //     protocol handler is registered in the main process and does
          //     not check the requesting frame's origin.
          //   - Inline <style> blocks and style= attributes work normally;
          //     only external <link rel=stylesheet> requests are blocked
          //     (which is desirable — imported HTML should be self-contained).
          srcDoc={html}
          sandbox=""
          className="min-h-0 flex-1 border-none bg-white"
          title="HTML preview"
          aria-label="Rendered HTML preview"
        />
      ) : (
        <textarea
          value={html}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          aria-label="HTML source"
          className="min-h-0 flex-1 resize-none bg-gray-950 p-4 font-mono text-sm leading-relaxed text-gray-200 focus:outline-none"
          placeholder="<!-- HTML source -->"
        />
      )}
    </div>
  );
}

function ModeTab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-emerald-500',
        active
          ? 'bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-900 dark:hover:text-gray-300',
      )}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );
}
