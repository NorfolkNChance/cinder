import { v7 as uuidv7 } from 'uuid';
import { asc, eq, isNull, sql } from 'drizzle-orm';
import { getDrizzle } from '../db/drizzle';
import { notes, projects } from '../db/schema';
import type {
  Project,
  ProjectArchiveInput,
  ProjectCreateInput,
  ProjectListInput,
  ProjectUpdateInput,
} from '../../shared/schemas/projects';

/**
 * Projects service.
 *
 * Conventions:
 *   - IDs are UUIDv7 generated server-side
 *   - `order` defaults to (max within parent) + 1 so new projects append
 *     to the end of their parent's list rather than colliding at 0
 *   - Archive is a soft-hide via `archived_at`; the list query filters it
 *     out by default. There is no separate soft-delete column for
 *     projects (Phase 2 decision — see schema.ts).
 *   - Hard delete cascades through SQLite FK constraints: sections go
 *     away (CASCADE), and tasks in this project get project_id set to
 *     null (SET NULL → become Inbox tasks).
 */

function nowIso(): string {
  return new Date().toISOString();
}

async function getById(id: string): Promise<Project | null> {
  const db = getDrizzle();
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  return (rows[0] as Project | undefined) ?? null;
}

async function nextOrderUnderParent(parentId: string | null): Promise<number> {
  const db = getDrizzle();
  // Drizzle's max() returns the value boxed; we coalesce against 0 so a
  // first-in-parent project gets order = 1.
  const rows = await db
    .select({ max: sql<number>`COALESCE(MAX(${projects.order}), 0)` })
    .from(projects)
    .where(
      parentId === null
        ? isNull(projects.parentId)
        : eq(projects.parentId, parentId),
    );
  const current = rows[0]?.max ?? 0;
  return current + 1;
}

export const projectsService = {
  async create(input: ProjectCreateInput): Promise<Project> {
    const db = getDrizzle();
    const now = nowIso();
    const parentId = input.parentId ?? null;
    const row: Project = {
      id: uuidv7(),
      name: input.name,
      parentId,
      color: input.color ?? null,
      order: await nextOrderUnderParent(parentId),
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(projects).values(row);
    return row;
  },

  get(id: string): Promise<Project | null> {
    return getById(id);
  },

  async list(input: ProjectListInput): Promise<readonly Project[]> {
    const db = getDrizzle();
    // Hide archived by default. Order by parent then position so tree
    // rendering in the renderer can do a simple grouping pass.
    const rows = input.includeArchived
      ? await db.select().from(projects).orderBy(asc(projects.order))
      : await db
          .select()
          .from(projects)
          .where(isNull(projects.archivedAt))
          .orderBy(asc(projects.order));
    return rows as Project[];
  },

  async update(input: ProjectUpdateInput): Promise<Project | null> {
    const db = getDrizzle();
    const patch = { ...input.patch, updatedAt: nowIso() };
    await db.update(projects).set(patch).where(eq(projects.id, input.id));
    return getById(input.id);
  },

  async archive(input: ProjectArchiveInput): Promise<Project | null> {
    const db = getDrizzle();
    await db
      .update(projects)
      .set({
        archivedAt: input.archived ? nowIso() : null,
        updatedAt: nowIso(),
      })
      .where(eq(projects.id, input.id));
    return getById(input.id);
  },

  async delete(id: string): Promise<void> {
    // Hard delete — FK cascades handle sections; tasks have their
    // project_id set to null so they become Inbox tasks.
    //
    // notes.project_id has no schema-level FK (added after the projects
    // table — see migration 0012), so SQLite won't SET NULL it for us.
    // Null it out explicitly first so notes survive project removal and
    // become unassigned rather than dangling at a dead project id.
    const db = getDrizzle();
    await db
      .update(notes)
      .set({ projectId: null })
      .where(eq(notes.projectId, id));
    await db.delete(projects).where(eq(projects.id, id));
  },
} as const;
