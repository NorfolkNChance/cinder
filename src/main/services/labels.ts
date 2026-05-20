import { v7 as uuidv7 } from 'uuid';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { getDrizzle } from '../db/drizzle';
import { labels, taskLabels } from '../db/schema';
import type {
  Label,
  LabelCreateInput,
  LabelUpdateInput,
  LabelsSetForTaskInput,
} from '../../shared/schemas/labels';

/**
 * Labels service.
 *
 * Names are unique-by-lowercase. The service enforces that at create
 * and update time — the DB doesn't have a unique constraint because
 * SQLite doesn't natively do case-insensitive uniqueness on TEXT
 * without a COLLATE NOCASE column attribute we'd have to add via
 * migration. The application-layer check is cheaper than a migration
 * for Phase 3.2; we can lock it down at the DB level later if needed.
 */

function nowIso(): string {
  return new Date().toISOString();
}

async function getById(id: string): Promise<Label | null> {
  const db = getDrizzle();
  const rows = await db.select().from(labels).where(eq(labels.id, id)).limit(1);
  return (rows[0] as Label | undefined) ?? null;
}

async function findByNameInsensitive(name: string): Promise<Label | null> {
  const db = getDrizzle();
  const lower = name.toLowerCase();
  const rows = await db
    .select()
    .from(labels)
    .where(sql`lower(${labels.name}) = ${lower}`)
    .limit(1);
  return (rows[0] as Label | undefined) ?? null;
}

export const labelsService = {
  async create(input: LabelCreateInput): Promise<Label> {
    const existing = await findByNameInsensitive(input.name);
    if (existing !== null) {
      throw new Error(`A label named "${existing.name}" already exists.`);
    }
    const db = getDrizzle();
    const now = nowIso();
    const row: Label = {
      id: uuidv7(),
      name: input.name,
      color: input.color ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(labels).values(row);
    return row;
  },

  get(id: string): Promise<Label | null> {
    return getById(id);
  },

  async list(): Promise<readonly Label[]> {
    const db = getDrizzle();
    const rows = await db.select().from(labels).orderBy(asc(labels.name));
    return rows as Label[];
  },

  async update(input: LabelUpdateInput): Promise<Label | null> {
    if (input.patch.name !== undefined) {
      const existing = await findByNameInsensitive(input.patch.name);
      if (existing !== null && existing.id !== input.id) {
        throw new Error(
          `A label named "${existing.name}" already exists.`,
        );
      }
    }
    const db = getDrizzle();
    const patch = { ...input.patch, updatedAt: nowIso() };
    await db.update(labels).set(patch).where(eq(labels.id, input.id));
    return getById(input.id);
  },

  async delete(id: string): Promise<void> {
    // FK cascade on task_labels handles attached rows.
    const db = getDrizzle();
    await db.delete(labels).where(eq(labels.id, id));
  },

  /**
   * Replace the set of labels attached to `taskId`. Operates by diff —
   * removes rows in DB-but-not-in-input, inserts rows in input-but-
   * not-in-DB. Safe to call with an empty list (clears all labels).
   */
  async setForTask(input: LabelsSetForTaskInput): Promise<void> {
    const db = getDrizzle();
    const existing = await db
      .select({ labelId: taskLabels.labelId })
      .from(taskLabels)
      .where(eq(taskLabels.taskId, input.taskId));
    const have = new Set(existing.map((r) => r.labelId));
    const want = new Set(input.labelIds);

    const toRemove = [...have].filter((id) => !want.has(id));
    const toAdd = [...want].filter((id) => !have.has(id));

    if (toRemove.length > 0) {
      await db
        .delete(taskLabels)
        .where(
          sql`${taskLabels.taskId} = ${input.taskId} AND ${taskLabels.labelId} IN (${sql.join(
            toRemove.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );
    }
    if (toAdd.length > 0) {
      await db
        .insert(taskLabels)
        .values(toAdd.map((labelId) => ({ taskId: input.taskId, labelId })));
    }
  },
} as const;

/**
 * Fetch every (taskId → labels[]) association for the given task IDs.
 * Used by tasksService.list to attach labels to each task in a single
 * extra round-trip rather than N per-task lookups.
 *
 * Returns a Map<taskId, Label[]> with no entry for tasks that have no
 * labels — callers should default to [].
 */
export async function getLabelsForTaskIds(
  taskIds: readonly string[],
): Promise<ReadonlyMap<string, readonly Label[]>> {
  const out = new Map<string, Label[]>();
  if (taskIds.length === 0) return out;
  const db = getDrizzle();
  const rows = await db
    .select({
      taskId: taskLabels.taskId,
      id: labels.id,
      name: labels.name,
      color: labels.color,
      createdAt: labels.createdAt,
      updatedAt: labels.updatedAt,
    })
    .from(taskLabels)
    .innerJoin(labels, eq(labels.id, taskLabels.labelId))
    .where(inArray(taskLabels.taskId, [...taskIds]));
  for (const r of rows) {
    const list = out.get(r.taskId) ?? [];
    list.push({
      id: r.id,
      name: r.name,
      color: r.color,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    });
    out.set(r.taskId, list);
  }
  return out;
}
