import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import clsx from 'clsx';

interface EditorToolbarProps {
  editor: Editor | null;
}

// ── Toolbar button ────────────────────────────────────────────────────────────

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: ToolbarButtonProps): JSX.Element {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onMouseDown={(e) => {
          // Prevent the editor losing focus when the toolbar is clicked.
          e.preventDefault();
          onClick();
        }}
        className={clsx(
          'flex h-7 min-w-[1.75rem] items-center justify-center rounded px-1.5 text-sm transition',
          'focus:outline-none focus:ring-2 focus:ring-emerald-500',
          active
            ? 'bg-gray-300 text-gray-900 dark:bg-gray-700 dark:text-white'
            : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200',
          disabled && 'cursor-not-allowed opacity-30',
        )}
      >
        {children}
      </button>
      {/* CSS-only tooltip — appears below the button on hover */}
      <span
        role="tooltip"
        className={clsx(
          'pointer-events-none absolute left-1/2 top-full z-50 mt-1.5',
          '-translate-x-1/2 whitespace-nowrap rounded bg-gray-700 px-2 py-1',
          'text-[11px] leading-none text-gray-100 shadow-lg',
          'opacity-0 transition-opacity delay-300 group-hover:opacity-100',
        )}
      >
        {label}
        {/* Arrow pointing up */}
        <span
          aria-hidden="true"
          className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-800"
        />
      </span>
    </div>
  );
}

function Divider(): JSX.Element {
  return <div className="mx-1 h-5 w-px bg-gray-300 dark:bg-gray-700" aria-hidden="true" />;
}

// ── Heading label ─────────────────────────────────────────────────────────────

function HeadingLabel({ level }: { level: 1 | 2 | 3 }): JSX.Element {
  return (
    <span className="font-mono text-[11px] font-bold leading-none">
      H{level}
    </span>
  );
}

// ── Main toolbar ──────────────────────────────────────────────────────────────

/**
 * Formatting ribbon for the TipTap markdown editor.
 *
 * Renders buttons for the most common ProseMirror commands available through
 * TipTap's StarterKit: headings (H1–H3), bold, italic, strikethrough, inline
 * code, bullet list, ordered list, blockquote, code block, and horizontal rule.
 *
 * Active state tracks the cursor position via `editor.isActive()`, which is
 * reactive because the parent component (`TipTapEditor`) re-renders on every
 * TipTap transaction.
 *
 * `onMouseDown` with `e.preventDefault()` is used instead of `onClick` so the
 * editor never loses focus when a button is pressed.
 */
export function EditorToolbar({ editor }: EditorToolbarProps): JSX.Element {
  const disabled = editor === null;

  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      h1: ctx.editor?.isActive('heading', { level: 1 }) ?? false,
      h2: ctx.editor?.isActive('heading', { level: 2 }) ?? false,
      h3: ctx.editor?.isActive('heading', { level: 3 }) ?? false,
      bold: ctx.editor?.isActive('bold') ?? false,
      italic: ctx.editor?.isActive('italic') ?? false,
      strike: ctx.editor?.isActive('strike') ?? false,
      code: ctx.editor?.isActive('code') ?? false,
      bulletList: ctx.editor?.isActive('bulletList') ?? false,
      orderedList: ctx.editor?.isActive('orderedList') ?? false,
      blockquote: ctx.editor?.isActive('blockquote') ?? false,
      codeBlock: ctx.editor?.isActive('codeBlock') ?? false,
    }),
  });

  return (
    <div
      role="toolbar"
      aria-label="Formatting toolbar"
      aria-controls="tiptap-editor-content"
      className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-100 px-4 py-1.5 dark:border-gray-800 dark:bg-gray-950"
    >
      {/* Headings */}
      <ToolbarButton
        label="Heading 1"
        active={state?.h1 ?? false}
        disabled={disabled}
        onClick={() =>
          editor?.chain().focus().toggleHeading({ level: 1 }).run()
        }
      >
        <HeadingLabel level={1} />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 2"
        active={state?.h2 ?? false}
        disabled={disabled}
        onClick={() =>
          editor?.chain().focus().toggleHeading({ level: 2 }).run()
        }
      >
        <HeadingLabel level={2} />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 3"
        active={state?.h3 ?? false}
        disabled={disabled}
        onClick={() =>
          editor?.chain().focus().toggleHeading({ level: 3 }).run()
        }
      >
        <HeadingLabel level={3} />
      </ToolbarButton>

      <Divider />

      {/* Inline marks */}
      <ToolbarButton
        label="Bold (⌘B)"
        active={state?.bold ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton
        label="Italic (⌘I)"
        active={state?.italic ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={state?.strike ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
      >
        {/* S with strikethrough */}
        <span className="line-through">S</span>
      </ToolbarButton>
      <ToolbarButton
        label="Inline code"
        active={state?.code ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleCode().run()}
      >
        <span className="font-mono text-xs">&lt;/&gt;</span>
      </ToolbarButton>

      <Divider />

      {/* Block structure */}
      <ToolbarButton
        label="Bullet list"
        active={state?.bulletList ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        {/* ≡ list icon */}
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="2" cy="4" r="1.5" />
          <rect x="5" y="3" width="9" height="2" rx="1" />
          <circle cx="2" cy="8" r="1.5" />
          <rect x="5" y="7" width="9" height="2" rx="1" />
          <circle cx="2" cy="12" r="1.5" />
          <rect x="5" y="11" width="9" height="2" rx="1" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        label="Ordered list"
        active={state?.orderedList ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="currentColor"
          aria-hidden="true"
        >
          <text x="0" y="5" fontSize="5" fontFamily="monospace">1.</text>
          <rect x="5" y="3" width="9" height="2" rx="1" />
          <text x="0" y="9.5" fontSize="5" fontFamily="monospace">2.</text>
          <rect x="5" y="7" width="9" height="2" rx="1" />
          <text x="0" y="14" fontSize="5" fontFamily="monospace">3.</text>
          <rect x="5" y="11" width="9" height="2" rx="1" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        label="Blockquote"
        active={state?.blockquote ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="0" y="2" width="2.5" height="12" rx="1" />
          <rect x="4" y="4" width="10" height="2" rx="1" />
          <rect x="4" y="8" width="8" height="2" rx="1" />
          <rect x="4" y="12" width="9" height="2" rx="1" />
        </svg>
      </ToolbarButton>

      <Divider />

      {/* Code block */}
      <ToolbarButton
        label="Code block"
        active={state?.codeBlock ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M5.5 4L1.5 8l4 4 1-1L3.5 8l3-3-1-1zM10.5 4l-1 1 3 3-3 3 1 1 4-4-4-4z" />
        </svg>
      </ToolbarButton>

      {/* Horizontal rule */}
      <ToolbarButton
        label="Horizontal rule"
        disabled={disabled}
        onClick={() => editor?.chain().focus().setHorizontalRule().run()}
      >
        {/* em-dash style icon */}
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="1" y="7" width="14" height="2" rx="1" />
        </svg>
      </ToolbarButton>
    </div>
  );
}
