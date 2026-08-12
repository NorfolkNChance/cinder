import { useState, useCallback } from 'react';
import clsx from 'clsx';
import {
  useCreateLabel,
  useCreateProject,
  useCreateSavedFilter,
  useDeleteLabel,
  useDeleteProject,
  useDeleteSavedFilter,
  useLabelsList,
  useProjectsList,
  useSavedFiltersList,
  useTriageCount,
} from './queries';
import { useUI } from '../../state/ui';
import { lex } from '../../../../shared/filter/lex';
import { parse } from '../../../../shared/filter/parse';
import { FilterSyntaxError } from '../../../../shared/filter/types';

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
  const { data: labels } = useLabelsList();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const createLabel = useCreateLabel();
  const deleteLabel = useDeleteLabel();
  const { data: savedFilters } = useSavedFiltersList();
  const createSavedFilter = useCreateSavedFilter();
  const deleteSavedFilter = useDeleteSavedFilter();

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

  // ── New-label inline input ───────────────────────────────────────────────
  const [isCreatingLabel, setIsCreatingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [labelError, setLabelError] = useState<string | null>(null);

  const submitNewLabel = useCallback(async () => {
    const name = newLabelName.trim();
    if (name.length === 0) {
      setIsCreatingLabel(false);
      setNewLabelName('');
      setLabelError(null);
      return;
    }
    try {
      const created = await createLabel.mutateAsync({ name });
      setNewLabelName('');
      setIsCreatingLabel(false);
      setLabelError(null);
      setTaskScope({ kind: 'label', id: created.id });
    } catch (e) {
      setLabelError(e instanceof Error ? e.message : 'Failed to create label');
    }
  }, [newLabelName, createLabel, setTaskScope]);

  const cancelNewLabel = useCallback(() => {
    setIsCreatingLabel(false);
    setNewLabelName('');
    setLabelError(null);
  }, []);

  const onDeleteLabel = async (
    id: string,
    e: React.MouseEvent,
  ): Promise<void> => {
    e.stopPropagation();
    if (taskScope.kind === 'label' && taskScope.id === id) {
      setTaskScope({ kind: 'inbox' });
    }
    await deleteLabel.mutateAsync(id);
  };

  // ── New saved-filter inline form ─────────────────────────────────────────
  const [isCreatingFilter, setIsCreatingFilter] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [newFilterExpr, setNewFilterExpr] = useState('');
  const [filterError, setFilterError] = useState<string | null>(null);

  // Live-validate the expression as the user types so they see syntax
  // errors immediately rather than only at save time. The compile step
  // runs server-side; here we only lex+parse for syntactic feedback.
  const liveExprError = (() => {
    const trimmed = newFilterExpr.trim();
    if (trimmed.length === 0) return null;
    try {
      parse(lex(trimmed));
      return null;
    } catch (e) {
      return e instanceof FilterSyntaxError ? e.message : 'invalid syntax';
    }
  })();

  const submitNewFilter = useCallback(async () => {
    const name = newFilterName.trim();
    const expression = newFilterExpr.trim();
    if (name.length === 0 || expression.length === 0) return;
    setFilterError(null);
    try {
      const created = await createSavedFilter.mutateAsync({
        name,
        expression,
      });
      setNewFilterName('');
      setNewFilterExpr('');
      setIsCreatingFilter(false);
      setTaskScope({ kind: 'filter', id: created.id });
    } catch (e) {
      setFilterError(
        e instanceof Error ? e.message : 'Failed to create filter',
      );
    }
  }, [newFilterName, newFilterExpr, createSavedFilter, setTaskScope]);

  const cancelNewFilter = useCallback(() => {
    setIsCreatingFilter(false);
    setNewFilterName('');
    setNewFilterExpr('');
    setFilterError(null);
  }, []);

  const onDeleteFilter = async (
    id: string,
    e: React.MouseEvent,
  ): Promise<void> => {
    e.stopPropagation();
    if (taskScope.kind === 'filter' && taskScope.id === id) {
      setTaskScope({ kind: 'inbox' });
    }
    await deleteSavedFilter.mutateAsync(id);
  };

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

  const triageCount = useTriageCount();

  return (
    <>
      <SectionHeader label="Smart views" />
      <TriageItem
        active={taskScope.kind === 'triage'}
        count={triageCount}
        onClick={() => setTaskScope({ kind: 'triage' })}
      />
      <SmartItem
        label="Inbox"
        active={taskScope.kind === 'inbox'}
        onClick={() => setTaskScope({ kind: 'inbox' })}
      />
      <SmartItem
        label="Today"
        active={taskScope.kind === 'today'}
        onClick={() => setTaskScope({ kind: 'today' })}
      />
      <SmartItem
        label="Upcoming"
        active={taskScope.kind === 'upcoming'}
        onClick={() => setTaskScope({ kind: 'upcoming' })}
      />

      {/*
        Single scroll container for the three list sections. Each
        section is natural height; the whole stack scrolls together if
        contents exceed the viewport. Earlier versions used per-section
        flex-1 + overflow-y-auto, which only allowed one section to
        consume remaining space — adding the Filters section broke that
        layout, so the simpler "one scroll for everything below smart
        views" approach took over.
      */}
      <div className="flex-1 overflow-y-auto">
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
              className="w-full rounded-md bg-gray-200 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-900 dark:text-gray-200 dark:placeholder-gray-500"
            />
            <p className="mt-1 px-1 text-xs text-gray-600">
              Enter to create, Esc to cancel.
            </p>
          </div>
        )}

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

        <SectionHeader
          label="Labels"
          action={
            !isCreatingLabel ? (
              <button
                onClick={() => setIsCreatingLabel(true)}
                title="New label"
                className="rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                + New
              </button>
            ) : null
          }
        />

        {isCreatingLabel && (
          <div className="px-3 py-2">
            <input
              autoFocus
              value={newLabelName}
              onChange={(e) => {
                setNewLabelName(e.target.value);
                setLabelError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitNewLabel();
                else if (e.key === 'Escape') cancelNewLabel();
              }}
              placeholder="urgent"
              className="w-full rounded-md bg-gray-200 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-900 dark:text-gray-200 dark:placeholder-gray-500"
            />
            <p
              className={clsx(
                'mt-1 px-1 text-xs',
                labelError !== null ? 'text-red-400' : 'text-gray-600',
              )}
            >
              {labelError ??
                'Letters, digits, _ or - only. Enter to create, Esc to cancel.'}
            </p>
          </div>
        )}

        {!labels || labels.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">No labels yet.</p>
        ) : (
          <ul>
            {labels.map((l) => (
              <LabelRow
                key={l.id}
                name={l.name}
                color={l.color}
                active={taskScope.kind === 'label' && taskScope.id === l.id}
                onSelect={() => setTaskScope({ kind: 'label', id: l.id })}
                onDelete={(e) => void onDeleteLabel(l.id, e)}
              />
            ))}
          </ul>
        )}

        <SectionHeader
          label="Filters"
          action={
            !isCreatingFilter ? (
              <button
                onClick={() => setIsCreatingFilter(true)}
                title="New filter"
                className="rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                + New
              </button>
            ) : null
          }
        />

        {isCreatingFilter && (
          <div className="space-y-2 px-3 py-2">
            <input
              autoFocus
              value={newFilterName}
              onChange={(e) => setNewFilterName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelNewFilter();
              }}
              placeholder="Filter name"
              className="w-full rounded-md bg-gray-200 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-900 dark:text-gray-200 dark:placeholder-gray-500"
            />
            <input
              value={newFilterExpr}
              onChange={(e) => {
                setNewFilterExpr(e.target.value);
                setFilterError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitNewFilter();
                else if (e.key === 'Escape') cancelNewFilter();
              }}
              placeholder="today & p1"
              className={clsx(
                'w-full rounded-md bg-gray-900 px-3 py-1.5 font-mono text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2',
                liveExprError !== null || filterError !== null
                  ? 'ring-1 ring-red-500 focus:ring-red-500'
                  : 'focus:ring-emerald-500',
              )}
            />
            <p
              className={clsx(
                'px-1 text-xs',
                liveExprError !== null || filterError !== null
                  ? 'text-red-400'
                  : 'text-gray-600',
              )}
            >
              {filterError ?? liveExprError ?? (
                <>
                  Try{' '}
                  <span className="font-mono">today &amp; p1</span>,{' '}
                  <span className="font-mono">@work &amp; overdue</span>,{' '}
                  <span className="font-mono">#personal &amp; no-date</span>.
                  Enter to save, Esc to cancel.
                </>
              )}
            </p>
          </div>
        )}

        {!savedFilters || savedFilters.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">No filters yet.</p>
        ) : (
          <ul>
            {savedFilters.map((f) => (
              <SavedFilterRow
                key={f.id}
                name={f.name}
                expression={f.expression}
                color={f.color}
                active={taskScope.kind === 'filter' && taskScope.id === f.id}
                onSelect={() => setTaskScope({ kind: 'filter', id: f.id })}
                onDelete={(e) => void onDeleteFilter(f.id, e)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Trash access at the bottom, mirroring the Notes sidebar footer. */}
      <div className="border-t border-gray-200/50 px-4 py-2 text-right dark:border-gray-800/50">
        <button
          onClick={useUI.getState().openTrash}
          title="Open Trash"
          aria-label="Open Trash"
          className="text-[11px] text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:text-gray-700 dark:hover:text-gray-400"
        >
          🗑 Trash
        </button>
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
    <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-800">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </h3>
      {action}
    </div>
  );
}

/**
 * Special sidebar item for the Triage smart view.
 * Shows an amber badge with the current triage task count when > 0.
 */
function TriageItem({
  active,
  count,
  onClick,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-center justify-between px-4 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500',
        active
          ? 'bg-gray-200 text-gray-900 dark:bg-gray-900 dark:text-white'
          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900/50',
      )}
    >
      <span>Triage</span>
      {count > 0 && (
        <span
          className={clsx(
            'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
            active
              ? 'bg-amber-500 text-white'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',
          )}
          aria-label={`${count} tasks need triage`}
        >
          {count}
        </span>
      )}
    </button>
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
          ? 'bg-gray-200 text-gray-900 dark:bg-gray-900 dark:text-white'
          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900/50',
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
        active ? 'bg-gray-200 dark:bg-gray-900' : 'hover:bg-gray-100 dark:hover:bg-gray-900/50',
      )}
    >
      <button
        onClick={onSelect}
        className={clsx(
          'flex min-w-0 flex-1 items-center gap-2 px-4 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500',
          active ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300',
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

function LabelRow({
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
        active ? 'bg-gray-200 dark:bg-gray-900' : 'hover:bg-gray-100 dark:hover:bg-gray-900/50',
      )}
    >
      <button
        onClick={onSelect}
        className={clsx(
          'flex min-w-0 flex-1 items-center gap-2 px-4 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500',
          active ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300',
        )}
      >
        <span
          aria-hidden
          className="font-mono text-xs"
          style={{ color: normaliseColor(color) }}
        >
          @
        </span>
        <span className="truncate">{name}</span>
      </button>
      <button
        onClick={onDelete}
        aria-label={`Delete label ${name}`}
        title="Delete label"
        className="absolute right-3 top-2 text-xs text-gray-500 opacity-0 hover:text-red-400 focus:opacity-100 focus:outline-none group-hover:opacity-60 hover:!opacity-100"
      >
        ✕
      </button>
    </li>
  );
}

function SavedFilterRow({
  name,
  expression,
  color,
  active,
  onSelect,
  onDelete,
}: {
  name: string;
  expression: string;
  color: string | null;
  active: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}): JSX.Element {
  return (
    <li
      className={clsx(
        'group relative flex items-center gap-2',
        active ? 'bg-gray-200 dark:bg-gray-900' : 'hover:bg-gray-100 dark:hover:bg-gray-900/50',
      )}
    >
      <button
        onClick={onSelect}
        title={expression}
        className={clsx(
          'flex min-w-0 flex-1 items-center gap-2 px-4 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500',
          active ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300',
        )}
      >
        <span
          aria-hidden
          className="text-xs"
          style={{ color: normaliseColor(color) }}
        >
          ⌕
        </span>
        <span className="truncate">{name}</span>
      </button>
      <button
        onClick={onDelete}
        aria-label={`Delete filter ${name}`}
        title="Delete filter"
        className="absolute right-3 top-2 text-xs text-gray-500 opacity-0 hover:text-red-400 focus:opacity-100 focus:outline-none group-hover:opacity-60 hover:!opacity-100"
      >
        ✕
      </button>
    </li>
  );
}

function normaliseColor(color: string | null): string {
  if (color === null) return '#6b7280'; // gray-500 — default for uncoloured items
  return color.startsWith('#') ? color : `#${color}`;
}
