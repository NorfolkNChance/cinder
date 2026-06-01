import { useState, useRef, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import { useFoldersList, useCreateFolder, useUpdateFolder, useDeleteFolder } from './folderQueries';
import { useUI } from '../../state/ui';
import type { Folder } from '../../../../shared/schemas/folders';
import type { NotesFolderScope } from './queries';

/**
 * Collapsible folder tree rendered inside the Notes sidebar.
 *
 * Features:
 *   - "All Notes" and "Unfiled" scope selectors at the top
 *   - Collapsible folder nodes (infinite nesting)
 *   - Inline folder creation with Enter/Escape
 *   - Inline rename on double-click
 *   - Delete with note-count confirmation on hover ✕
 */

// ── Tree builder ──────────────────────────────────────────────────────────────

interface FolderNode {
  folder: Folder;
  children: FolderNode[];
}

function buildTree(folders: readonly Folder[]): FolderNode[] {
  const byParent = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const key = f.parentId;
    const list = byParent.get(key) ?? [];
    list.push(f);
    byParent.set(key, list);
  }

  function buildNodes(parentId: string | null): FolderNode[] {
    return (byParent.get(parentId) ?? [])
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map((f) => ({ folder: f, children: buildNodes(f.id) }));
  }

  return buildNodes(null);
}

// ── Main component ────────────────────────────────────────────────────────────

export function FolderTree(): JSX.Element | null {
  const { data: folders } = useFoldersList();
  const scope = useUI((s) => s.notesFolderScope);
  const setScope = useUI((s) => s.setNotesFolderScope);
  const createFolder = useCreateFolder();

  // Inline new-folder creation state.
  // parentId === undefined → not creating; null → root level; string → sub-folder
  const [creatingParentId, setCreatingParentId] = useState<
    string | null | undefined
  >(undefined);
  const [newName, setNewName] = useState('');
  const newNameRef = useRef<HTMLInputElement>(null);

  const allFolders = folders ?? [];
  const tree = buildTree(allFolders);

  // If no folders exist yet, show a lighter placeholder.
  if (allFolders.length === 0 && creatingParentId === undefined) {
    return (
      <div className="px-4 py-2">
        <ScopeButton label="All Notes" icon="📋" active={scope.kind === 'all'} onClick={() => setScope({ kind: 'all' })} />
        <button
          onClick={() => { setCreatingParentId(null); setNewName(''); }}
          className="mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-gray-600 dark:hover:text-gray-400"
        >
          <span aria-hidden>+</span> New Folder
        </button>
        {creatingParentId === null && (
          <NewFolderInput
            ref={newNameRef}
            value={newName}
            depth={0}
            onChange={setNewName}
            onConfirm={() => void handleCreate(null)}
            onCancel={() => setCreatingParentId(undefined)}
          />
        )}
      </div>
    );
  }

  async function handleCreate(parentId: string | null): Promise<void> {
    const trimmed = newName.trim();
    if (trimmed) {
      await createFolder.mutateAsync({ name: trimmed, ...(parentId !== null ? { parentId } : {}) });
    }
    setCreatingParentId(undefined);
    setNewName('');
  }

  return (
    <div className="px-2 py-1">
      {/* Scope selectors */}
      <ScopeButton label="All Notes" icon="📋" active={scope.kind === 'all'} onClick={() => setScope({ kind: 'all' })} />
      <ScopeButton label="Unfiled" icon="📝" active={scope.kind === 'unfiled'} onClick={() => setScope({ kind: 'unfiled' })} />

      <div className="my-1 border-t border-gray-200 dark:border-gray-800" />

      {/* Folder tree */}
      <div className="space-y-0.5">
        {tree.map((node) => (
          <FolderNodeView
            key={node.folder.id}
            node={node}
            depth={0}
            scope={scope}
            onSelect={setScope}
            onStartCreate={(parentId) => {
              setCreatingParentId(parentId);
              setNewName('');
            }}
            creatingParentId={creatingParentId}
            newName={newName}
            onNewNameChange={setNewName}
            onConfirmCreate={handleCreate}
            onCancelCreate={() => setCreatingParentId(undefined)}
          />
        ))}

        {/* Root-level new folder */}
        {creatingParentId === null && (
          <NewFolderInput
            ref={newNameRef}
            value={newName}
            depth={0}
            onChange={setNewName}
            onConfirm={() => void handleCreate(null)}
            onCancel={() => setCreatingParentId(undefined)}
          />
        )}
      </div>

      {/* + New Folder button at bottom */}
      {creatingParentId === undefined && (
        <button
          onClick={() => { setCreatingParentId(null); setNewName(''); }}
          className="mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-gray-600 dark:hover:text-gray-400"
        >
          <span aria-hidden>+</span> New Folder
        </button>
      )}
    </div>
  );
}

// ── Scope selector button ─────────────────────────────────────────────────────

function ScopeButton({
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
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm transition',
        active
          ? 'bg-emerald-100 font-medium text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200'
          : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-800',
      )}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ── Folder node ───────────────────────────────────────────────────────────────

function FolderNodeView({
  node,
  depth,
  scope,
  onSelect,
  onStartCreate,
  creatingParentId,
  newName,
  onNewNameChange,
  onConfirmCreate,
  onCancelCreate,
}: {
  node: FolderNode;
  depth: number;
  scope: NotesFolderScope;
  onSelect: (s: NotesFolderScope) => void;
  onStartCreate: (parentId: string) => void;
  creatingParentId: string | null | undefined;
  newName: string;
  onNewNameChange: (v: string) => void;
  onConfirmCreate: (parentId: string | null) => Promise<void>;
  onCancelCreate: () => void;
}): JSX.Element {
  const { folder, children } = node;
  const isActive =
    scope.kind === 'folder' && scope.id === folder.id;
  const [open, setOpen] = useState(depth < 1);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.name);
  const renameRef = useRef<HTMLInputElement>(null);
  const updateFolder = useUpdateFolder();
  const deleteFolder = useDeleteFolder();

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  const commitRename = useCallback(async () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== folder.name) {
      await updateFolder.mutateAsync({ id: folder.id, patch: { name: trimmed } });
    }
    setRenaming(false);
  }, [renameValue, folder, updateFolder]);

  const handleDelete = useCallback(async () => {
    const result = await deleteFolder.mutateAsync(folder.id);
    if (!result.ok) {
      alert(result.reason); // native alert — rare edge case
    }
  }, [folder.id, deleteFolder]);

  const indent = depth * 12;

  return (
    <div>
      <div
        className={clsx(
          'group flex items-center rounded text-sm transition',
          isActive
            ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200'
            : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-800',
        )}
        style={{ paddingLeft: `${8 + indent}px` }}
      >
        {/* Expand/collapse chevron */}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Collapse folder' : 'Expand folder'}
          className="flex h-6 w-5 shrink-0 items-center justify-center focus:outline-none"
        >
          {children.length > 0 ? (
            <span
              className={clsx(
                'text-[10px] text-gray-400 transition-transform',
                open ? 'rotate-90' : '',
              )}
              aria-hidden
            >
              ▶
            </span>
          ) : (
            <span className="text-[8px] text-gray-300 dark:text-gray-700" aria-hidden>·</span>
          )}
        </button>

        {/* Folder name / rename input */}
        {renaming ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void commitRename(); }
              if (e.key === 'Escape') { setRenaming(false); setRenameValue(folder.name); }
            }}
            onBlur={() => void commitRename()}
            className="min-w-0 flex-1 bg-transparent py-1 text-sm focus:outline-none"
            aria-label="Rename folder"
          />
        ) : (
          <button
            onClick={() => onSelect({ kind: 'folder', id: folder.id })}
            onDoubleClick={() => { setRenaming(true); setRenameValue(folder.name); }}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left focus:outline-none"
          >
            <span aria-hidden>📁</span>
            <span className="truncate">{folder.name}</span>
          </button>
        )}

        {/* Hover actions */}
        {!renaming && (
          <div className="ml-auto flex shrink-0 items-center gap-0.5 pr-1 opacity-0 group-hover:opacity-100">
            <button
              onClick={() => onStartCreate(folder.id)}
              title="New sub-folder"
              aria-label={`New sub-folder in ${folder.name}`}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-300 hover:text-gray-700 focus:outline-none dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <span className="text-[10px]">+</span>
            </button>
            <button
              onClick={() => void handleDelete()}
              title="Delete folder"
              aria-label={`Delete folder ${folder.name}`}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-300 hover:text-red-500 focus:outline-none dark:hover:bg-gray-700 dark:hover:text-red-400"
            >
              <span className="text-[10px]">✕</span>
            </button>
          </div>
        )}
      </div>

      {/* Children */}
      {open && (
        <div>
          {children.map((child) => (
            <FolderNodeView
              key={child.folder.id}
              node={child}
              depth={depth + 1}
              scope={scope}
              onSelect={onSelect}
              onStartCreate={onStartCreate}
              creatingParentId={creatingParentId}
              newName={newName}
              onNewNameChange={onNewNameChange}
              onConfirmCreate={onConfirmCreate}
              onCancelCreate={onCancelCreate}
            />
          ))}
          {/* Sub-folder creation input */}
          {creatingParentId === folder.id && (
            <NewFolderInput
              value={newName}
              depth={depth + 1}
              onChange={onNewNameChange}
              onConfirm={() => void onConfirmCreate(folder.id)}
              onCancel={onCancelCreate}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline new-folder input ───────────────────────────────────────────────────

const NewFolderInput = function NewFolderInput({
  value,
  depth,
  onChange,
  onConfirm,
  onCancel,
  ref: _ref,
}: {
  ref?: React.Ref<HTMLInputElement>;
  value: string;
  depth: number;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  const localRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localRef.current?.focus();
  }, []);

  return (
    <div
      className="flex items-center rounded bg-gray-100 text-sm dark:bg-gray-800"
      style={{ paddingLeft: `${8 + (depth + 1) * 12}px` }}
    >
      <span aria-hidden className="mr-1.5 text-gray-400">📁</span>
      <input
        ref={localRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        onBlur={onConfirm}
        placeholder="Folder name"
        aria-label="New folder name"
        className="min-w-0 flex-1 bg-transparent py-1 text-sm text-gray-800 placeholder-gray-400 focus:outline-none dark:text-gray-200"
      />
    </div>
  );
};
