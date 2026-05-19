import {
  index,
  integer,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

/**
 * Database schema for Cinder.
 *
 * Conventions (see ARCHITECTURE.md §7):
 *   - IDs are UUIDv7 (time-sortable, sync-friendly) generated in application
 *     code. Stored as TEXT.
 *   - Timestamps are UTC ISO-8601 strings stored as TEXT (§7.1). Converted at
 *     the UI boundary only.
 *   - Soft deletes via `deleted_at` (§7.2). Hard delete runs on a separate
 *     schedule. All read queries must filter `WHERE deleted_at IS NULL`.
 *   - Foreign keys are enabled at runtime via `PRAGMA foreign_keys = ON`
 *     (set in src/main/db/index.ts).
 */

// ─── Notes ───────────────────────────────────────────────────────────────────

/**
 * Notes table.
 *
 * `folder_id` is reserved for a future folders feature (Phase 2+). It is
 * nullable and unconstrained at the schema level — no folders table exists
 * yet. Once folders are introduced, add the FK in a migration.
 *
 * The canonical storage format for note body is markdown text (§6.1). The
 * ProseMirror document is an in-memory editing format only.
 */
export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    folderId: text('folder_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => ({
    deletedAtIdx: index('notes_deleted_at_idx').on(table.deletedAt),
    updatedAtIdx: index('notes_updated_at_idx').on(table.updatedAt),
  }),
);

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;

// ─── Projects ────────────────────────────────────────────────────────────────

/**
 * Projects table (§6.2).
 *
 * `parent_id` enables nested projects (sub-projects); ON DELETE SET NULL means
 * children become top-level if a parent is hard-deleted. Soft delete is
 * out of scope for projects in Phase 2 — projects are archived (via
 * `archived_at`) rather than deleted. The presence of a soft-delete column
 * is left for Phase 3+ if needed.
 *
 * `order` is the manual reorder position within the parent (or top level if
 * `parent_id` is null). Default 0 — new projects get appended via MAX+1 in
 * the service layer.
 */
export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    parentId: text('parent_id').references(
      (): AnySQLiteColumn => projects.id,
      { onDelete: 'set null' },
    ),
    color: text('color'),
    order: integer('order').notNull().default(0),
    archivedAt: text('archived_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    parentIdx: index('projects_parent_idx').on(table.parentId),
    orderIdx: index('projects_order_idx').on(table.order),
    archivedIdx: index('projects_archived_idx').on(table.archivedAt),
  }),
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

// ─── Sections ────────────────────────────────────────────────────────────────

/**
 * Sections table (§6.2).
 *
 * Sections live within a project — `project_id` is required and CASCADE
 * deletes mean sections vanish if their project is hard-deleted. A task can
 * sit inside a section or directly in a project (section_id null).
 */
export const sections = sqliteTable(
  'sections',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    order: integer('order').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    projectIdx: index('sections_project_idx').on(table.projectId),
    orderIdx: index('sections_order_idx').on(table.order),
  }),
);

export type Section = typeof sections.$inferSelect;
export type NewSection = typeof sections.$inferInsert;

// ─── Tasks ───────────────────────────────────────────────────────────────────

/**
 * Tasks table (§6.2).
 *
 * Phase 2 columns. `due_recurrence` (RRULE string) is here from day one
 * even though recurring-task semantics ship in Phase 3 — having the column
 * available means we don't need a migration to add it later.
 *
 *   - `project_id` nullable: tasks without a project are "Inbox" tasks.
 *     SET NULL on project delete so tasks survive project removal.
 *   - `section_id` nullable: a task can be in a project without being in a
 *     section. SET NULL on section delete.
 *   - `parent_task_id` for subtasks (§6.2). CASCADE means deleting a parent
 *     task removes its subtree.
 *   - `priority` is 1-4 where 1 is highest (Todoist convention).
 *     Default 4 (lowest) so newly-created tasks don't shout.
 *   - `due_date` is ISO-8601 — can be a date ('2026-05-20') or a datetime
 *     ('2026-05-20T15:00:00Z'). Service-level helpers parse appropriately.
 *   - `completed_at` non-null = done. Renderer treats null as active.
 *   - `deleted_at` non-null = soft-deleted (§7.2).
 *
 * Indexes are tuned for the views that ship in Phase 2:
 *   - per-project view → project_id
 *   - Today view → due_date + completed_at
 *   - Inbox view → project_id IS NULL + completed_at + deleted_at
 *   - "active tasks" base filter → completed_at + deleted_at
 */
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    sectionId: text('section_id').references(() => sections.id, {
      onDelete: 'set null',
    }),
    parentTaskId: text('parent_task_id').references(
      (): AnySQLiteColumn => tasks.id,
      { onDelete: 'cascade' },
    ),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    dueDate: text('due_date'),
    dueRecurrence: text('due_recurrence'),
    priority: integer('priority').notNull().default(4),
    order: integer('order').notNull().default(0),
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => ({
    projectIdx: index('tasks_project_idx').on(table.projectId),
    sectionIdx: index('tasks_section_idx').on(table.sectionId),
    parentIdx: index('tasks_parent_idx').on(table.parentTaskId),
    dueDateIdx: index('tasks_due_date_idx').on(table.dueDate),
    completedAtIdx: index('tasks_completed_at_idx').on(table.completedAt),
    deletedAtIdx: index('tasks_deleted_at_idx').on(table.deletedAt),
  }),
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
