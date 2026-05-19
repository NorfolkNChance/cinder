import { useState, useCallback } from 'react';
import clsx from 'clsx';
import { useProjectsList, useCreateProject, useDeleteProject } from './queries';
import { useUI } from '../../state/ui';

/**
 * Tasks-mode sidebar.
 *
 * Shows smart views (Inbox only for milestone 2.2 — Today/Upcoming
 * arrive in 2.3) and the list of user projects. Inline "+ New Project"
 * input rather than a modal — minimum chrome, ESC cancels.
 */
export function TasksSidebar(): JSX.Element {
  const taskScope = useUI((s) => s.taskScope);
  const setTaskScope = useUI((s) => s.setTaskScope);
  const { data: projects, isLoading } = useProjectsList();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();

  // ── New-project inline input ─────────────────────────────────────────────
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const submitNewProject = useCallback(async () => {
    const name = newName.trim();
    if (name.length === 0) {
      setIsCreating(false);
      setNewName('');
      return;
    }
    const created = await createProject.mutateAsync({ name });
    setNewName('');
    setIsCreating(false);
    setTaskScope({ kind: 'project', id: created.id });
  }, [newName, createProject, setTaskScope]);

  const cancelNewProject = useCallback(() => {
    setIsCreating(false);
    setNewName('');
  }, []);

  // ── Delete project ───────────────────────────────────────────────────────
  const onDeleteProject = async (
    id: string,
    e: React.MouseEvent,
  ): Promise<void> => {
    e.stopPropagation();
    // If we're currently viewing the project being deleted, fall back to Inbox.
    if (taskScope.kind === 'project' && taskScope.id === id) {
      setTaskScope({ kind: 'inbox' });
    }
    await deleteProject.mutateAsync(id);
  };

  return (
    <>
      <SectionHeader label="Smart views" />
      <SmartItem
        label="Inbox"
        active={taskScope.kind === 'inbox'}
        onClick={() => setTaskScope({ kind: 'inbox' })}
      />

      <SectionHeader
        label="Projects"
        action={
          !isCreating ? (
            <button
              onClick={() => setIsCreating(true)}
              title="New project"
              className="rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              + New
            </button>
          ) : null
        }
      />

      {isCreating && (
        <div className="px-3 py-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitNewProject();
              else if (e.key === 'Escape') cancelNewProject();
            }}
            placeholder="Project name…"
            className="w-full rounded-md bg-gray-900 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p className="mt-1 px-1 text-xs text-gray-600">
            Enter to create, Esc to cancel.
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="px-4 py-3 text-sm text-gray-500">Loading…</p>
        ) : !projects || projects.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">No projects yet.</p>
        ) : (
          <ul>
            {projects.map((p) => (
              <ProjectRow
                key={p.id}
                name={p.name}
                color={p.color}
                active={
                  taskScope.kind === 'project' && taskScope.id === p.id
                }
                onSelect={() => setTaskScope({ kind: 'project', id: p.id })}
                onDelete={(e) => void onDeleteProject(p.id, e)}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function SectionHeader({
  label,
  action,
}: {
  label: string;
  action?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </h3>
      {action}
    </div>
  );
}

function SmartItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'block w-full px-4 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500',
        active
          ? 'bg-gray-900 text-white'
          : 'text-gray-300 hover:bg-gray-900/50',
      )}
    >
      {label}
    </button>
  );
}

function ProjectRow({
  name,
  color,
  active,
  onSelect,
  onDelete,
}: {
  name: string;
  color: string | null;
  active: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}): JSX.Element {
  return (
    <li
      className={clsx(
        'group relative flex items-center gap-2',
        active ? 'bg-gray-900' : 'hover:bg-gray-900/50',
      )}
    >
      <button
        onClick={onSelect}
        className={clsx(
          'flex min-w-0 flex-1 items-center gap-2 px-4 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500',
          active ? 'text-white' : 'text-gray-300',
        )}
      >
        <span
          aria-hidden
          className="inline-block size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: normaliseColor(color) }}
        />
        <span className="truncate">{name}</span>
      </button>
      <button
        onClick={onDelete}
        aria-label={`Delete ${name}`}
        title="Delete project"
        className="absolute right-3 top-2 text-xs text-gray-500 opacity-0 hover:text-red-400 focus:opacity-100 focus:outline-none group-hover:opacity-60 hover:!opacity-100"
      >
        ✕
      </button>
    </li>
  );
}

function normaliseColor(color: string | null): string {
  if (color === null) return '#6b7280'; // gray-500 — default for uncoloured projects
  return color.startsWith('#') ? color : `#${color}`;
}
