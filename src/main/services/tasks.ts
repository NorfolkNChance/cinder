import { v7 as uuidv7 } from 'uuid';
import { and, asc, desc, eq, exists, gte, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { getDb } from '../db/index';
import { getDrizzle } from '../db/drizzle';
import { tasks, taskLabels } from '../db/schema';
import { computeNextOccurrence } from '../../shared/recurrence';
import { filterToSql } from '../../shared/filter';
import { getLabelsForTaskIds } from './labels';
import type {
  Task,
  TaskCompleteInput,
  TaskCreateInput,
  TaskListInput,
  TaskSearchInput,
  TaskUpdateInput,
  TaskWithLabels,
} from '../../shared/schemas/tasks';

/**
 * Tasks service.
 *
 * The list method is the workhorse — every view in Phase 2 (Inbox,
 * Today, per-project) maps to a particular set of filters on this one
 * query. See TaskListInput for the available predicates.
 *
 * Completion semantics: setting `completedAt` to a timestamp marks the
 * task done; clearing it reopens. The `complete()` method is the
 * dedicated entry point for both — pass `completed: true/false`.
 *
 * Deferred to Phase 3:
 *   - Recurrence: completing a recurring task should spawn the next
 *     occurrence rather than just stamp completed_at. The
 *     dueRecurrence column already exists; the engine doesn't.
 *   - Subtask cascade on complete: completing a parent doesn't auto-
 *     complete children today. May or may not be desired UX.
 */

function nowIso(): string {
  return new Date().toISOString();
}

async function getById(id: string): Promise<Task | null> {
  const db = getDrizzle();
  const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return (rows[0] as Task | undefined) ?? null;
}

export const tasksService = {
  async create(input: TaskCreateInput): Promise<Task> {
    const db = getDrizzle();
    const now = nowIso();
    const row: Task = {
      id: uuidv7(),
      title: input.title,
      description: input.description ?? '',
      projectId: input.projectId ?? null,
      sectionId: input.sectionId ?? null,
      parentTaskId: input.parentTaskId ?? null,
      dueDate: input.dueDate ?? null,
      dueRecurrence: input.dueRecurrence ?? null,
      priority: input.priority ?? 4,
      // Append: in v1 we don't compute MAX(order) per scope on insert —
      // the renderer can reorder explicitly, and Drizzle's default of 0
      // means "unsorted" works fine for the list ordering below
      // (ORDER BY order, created_at).
      order: 0,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      triage: input.triage ?? 0,
      sourceNoteId: input.sourceNoteId ?? null,
    };
    await db.insert(tasks).values(row);

    // Attach any labels the caller specified. Atomic-by-IPC-call: if a
    // label insert fails the create has already happened, but the
    // renderer treats label attachment as best-effort so a partial
    // failure here surfaces as "task created without all labels" — not
    // worth a transaction wrapper for v1.
    if (input.labelIds !== undefined && input.labelIds.length > 0) {
      await db
        .insert(taskLabels)
        .values(
          input.labelIds.map((labelId) => ({ taskId: row.id, labelId })),
        );
    }

    return row;
  },

  get(id: string): Promise<Task | null> {
    return getById(id);
  },

  async list(input: TaskListInput): Promise<readonly TaskWithLabels[]> {
    // Filter-DSL path: when the renderer passes a filter expression, the
    // compiled SQL fragment owns the WHERE clause. We still AND in the
    // baseline soft-delete filter and (unless the filter mentions
    // completion) the active-tasks default. Drizzle's query builder
    // doesn't handle raw user-defined fragments cleanly, so this branch
    // drops to the underlying connection — same pattern as FTS search.
    if (input.filter !== undefined && input.filter.trim().length > 0) {
      return listByFilter(input);
    }

    const db = getDrizzle();

    const conditions: SQL[] = [];

    // Soft-delete and completion filters default to hiding both.
    if (!input.includeDeleted) conditions.push(isNull(tasks.deletedAt));
    if (!input.includeCompleted) conditions.push(isNull(tasks.completedAt));

    // Triage filter: when triageOnly = true, show only triage tasks.
    // Otherwise (default), hide triage tasks from all normal views so they
    // don't pollute Inbox/Today/etc. until the user acknowledges them.
    if (input.triageOnly === true) {
      conditions.push(eq(tasks.triage, 1));
    } else {
      conditions.push(eq(tasks.triage, 0));
    }

    // Scope filters. `projectId: null` is the "Inbox" predicate (no project),
    // distinct from `projectId: undefined` (any project).
    if (input.projectId !== undefined) {
      conditions.push(
        input.projectId === null
          ? isNull(tasks.projectId)
          : eq(tasks.projectId, input.projectId),
      );
    }
    if (input.sectionId !== undefined) {
      conditions.push(eq(tasks.sectionId, input.sectionId));
    }
    if (input.parentTaskId !== undefined) {
      conditions.push(
        input.parentTaskId === null
          ? isNull(tasks.parentTaskId)
          : eq(tasks.parentTaskId, input.parentTaskId),
      );
    }

    // Per-label filter: an EXISTS subquery over task_labels keeps the
    // outer SELECT simple (no JOIN/GROUP gymnastics) and plays well
    // with the other conditions.
    if (input.labelId !== undefined) {
      const labelId = input.labelId;
      conditions.push(
        exists(
          db
            .select({ x: taskLabels.taskId })
            .from(taskLabels)
            .where(
              and(
                eq(taskLabels.taskId, tasks.id),
                eq(taskLabels.labelId, labelId),
              ),
            ),
        ),
      );
    }

    // Due-date window for Today / Upcoming. We rely on lexicographic
    // ordering of ISO-8601 strings here (valid because the format is
    // year-first, fixed-width). Tasks without a due_date are NEVER
    // included by these predicates — IS NULL won't match a comparison.
    //
    // dueBefore is a *strict* upper bound — important for date-only vs
    // datetime comparisons: lexicographically '2026-05-19' < '2026-05-19T15:00Z',
    // so an inclusive bound on '2026-05-19' would miss every datetime
    // that same day. Callers pass the start of the next day to mean
    // "everything on this day".
    if (input.dueBefore !== undefined) {
      conditions.push(lt(tasks.dueDate, input.dueBefore));
    }
    if (input.dueOnOrAfter !== undefined) {
      conditions.push(gte(tasks.dueDate, input.dueOnOrAfter));
    }

    const where = conditions.length === 0 ? undefined : and(...conditions);
    const limit = input.limit ?? 500;

    // Sort: explicit order column first (manual reordering), then
    // creation order as a tiebreaker. Priority is intentionally NOT in
    // the default sort — different views want different sort keys, and
    // the renderer can re-sort what it gets in-memory.
    const rows = await db
      .select()
      .from(tasks)
      .where(where)
      .orderBy(asc(tasks.order), asc(tasks.createdAt))
      .limit(limit);

    const taskRows = rows as Task[];
    // Attach labels in a single follow-up query rather than per-task
    // round-trips. See getLabelsForTaskIds for the join.
    const labelsByTask = await getLabelsForTaskIds(
      taskRows.map((t) => t.id),
    );
    return taskRows.map((t) => ({
      ...t,
      labels: [...(labelsByTask.get(t.id) ?? [])],
    }));
  },

  async search(input: TaskSearchInput): Promise<readonly TaskWithLabels[]> {
    const term = input.query.trim();
    if (term.length === 0) return [];

    const db = getDrizzle();
    const limit = input.limit ?? 50;

    // Substring match over title + description. Escape the LIKE wildcards
    // (% _ \) in the user term so a literal "50%" doesn't match everything.
    // Unlike the normal list views, search deliberately includes completed
    // and triage tasks — a global "find anything" should surface them — but
    // still excludes soft-deleted rows.
    const pattern = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const where = and(
      isNull(tasks.deletedAt),
      sql`(${tasks.title} LIKE ${pattern} ESCAPE '\\' OR ${tasks.description} LIKE ${pattern} ESCAPE '\\')`,
    );

    const rows = await db
      .select()
      .from(tasks)
      .where(where)
      .orderBy(desc(tasks.updatedAt))
      .limit(limit);

    const taskRows = rows as Task[];
    const labelsByTask = await getLabelsForTaskIds(taskRows.map((t) => t.id));
    return taskRows.map((t) => ({
      ...t,
      labels: [...(labelsByTask.get(t.id) ?? [])],
    }));
  },

  async update(input: TaskUpdateInput): Promise<Task | null> {
    const db = getDrizzle();
    const patch = { ...input.patch, updatedAt: nowIso() };
    await db.update(tasks).set(patch).where(eq(tasks.id, input.id));
    return getById(input.id);
  },

  async complete(input: TaskCompleteInput): Promise<Task | null> {
    const db = getDrizzle();
    const now = nowIso();

    // Recurring tasks (§6.2): completing one advances its due_date to the
    // next occurrence instead of stamping completed_at. The task keeps
    // rolling forward until the rule has no more occurrences (which is
    // when we fall through to the normal completion path).
    //
    // Reopening (completed:false) skips this branch entirely — that's a
    // direct undo of a prior completion, not a recurrence event.
    if (input.completed) {
      const task = await getById(input.id);
      if (
        task !== null &&
        task.dueRecurrence !== null &&
        task.dueDate !== null
      ) {
        const next = computeNextOccurrence(task.dueRecurrence, task.dueDate);
        if (next !== null) {
          await db
            .update(tasks)
            .set({ dueDate: next, updatedAt: now })
            .where(eq(tasks.id, input.id));
          return getById(input.id);
        }
        // No further occurrences — fall through and mark complete normally.
      }
    }

    await db
      .update(tasks)
      .set({
        completedAt: input.completed ? now : null,
        updatedAt: now,
      })
      .where(eq(tasks.id, input.id));
    return getById(input.id);
  },

  async delete(id: string): Promise<void> {
    // Soft delete via deleted_at. The FK cascade on parent_task_id only
    // fires on hard delete, so subtasks survive a soft-deleted parent
    // (they'll be hard-deleted together when the grace period elapses).
    const db = getDrizzle();
    const now = nowIso();
    await db
      .update(tasks)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(tasks.id, id));
  },
} as const;

/**
 * Filter-DSL list path. Drops out of Drizzle because the compiled SQL
 * fragment is a raw string; mixing it back into a Drizzle query builder
 * would require building a `sql` template tagged literal for the
 * fragment, which is awkward and offers no real benefit.
 */
async function listByFilter(
  input: TaskListInput,
): Promise<readonly TaskWithLabels[]> {
  if (input.filter === undefined) return [];

  // Compile — throws FilterSyntaxError for bad input; the handler
  // surfaces the message to the renderer as a rejected promise.
  const compiled = filterToSql(input.filter);
  const baseConditions: string[] = ['deleted_at IS NULL', 'triage = 0'];
  // Suppress the default "active tasks only" filter if the user
  // explicitly mentioned completion status anywhere in the expression
  // (e.g. `completed & today`, `!completed`).
  if (!compiled.mentionsCompleted && !input.includeCompleted) {
    baseConditions.push('completed_at IS NULL');
  }
  baseConditions.push(compiled.fragment.sql);
  const where = baseConditions.join(' AND ');
  const limit = input.limit ?? 500;

  const sql = `SELECT id, project_id AS projectId, section_id AS sectionId,
                      parent_task_id AS parentTaskId,
                      title, description,
                      due_date AS dueDate, due_recurrence AS dueRecurrence,
                      priority, "order" AS "order",
                      completed_at AS completedAt,
                      created_at AS createdAt, updated_at AS updatedAt,
                      deleted_at AS deletedAt,
                      triage,
                      source_note_id AS sourceNoteId
                 FROM tasks
                WHERE ${where}
                ORDER BY "order" ASC, created_at ASC
                LIMIT ?`;
  const params = [...compiled.fragment.params, limit];

  const db = getDb();
  const rows: Task[] = await new Promise((resolve, reject) => {
    db.all(sql, params, (err: Error | null, result: unknown[]) => {
      if (err) reject(err);
      else resolve(result as Task[]);
    });
  });

  const labelsByTask = await getLabelsForTaskIds(rows.map((t) => t.id));
  return rows.map((t) => ({
    ...t,
    labels: [...(labelsByTask.get(t.id) ?? [])],
  }));
}
