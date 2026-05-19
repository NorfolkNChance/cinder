import { v7 as uuidv7 } from 'uuid';
import { and, asc, eq, gte, isNull, lt, type SQL } from 'drizzle-orm';
import { getDrizzle } from '../db/drizzle';
import { tasks } from '../db/schema';
import { computeNextOccurrence } from '../../shared/recurrence';
import type {
  Task,
  TaskCompleteInput,
  TaskCreateInput,
  TaskListInput,
  TaskUpdateInput,
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
    };
    await db.insert(tasks).values(row);
    return row;
  },

  get(id: string): Promise<Task | null> {
    return getById(id);
  },

  async list(input: TaskListInput): Promise<readonly Task[]> {
    const db = getDrizzle();

    const conditions: SQL[] = [];

    // Soft-delete and completion filters default to hiding both.
    if (!input.includeDeleted) conditions.push(isNull(tasks.deletedAt));
    if (!input.includeCompleted) conditions.push(isNull(tasks.completedAt));

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
    return rows as Task[];
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
