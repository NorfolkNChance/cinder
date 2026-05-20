import { v7 as uuidv7 } from 'uuid';
import { asc, eq, sql } from 'drizzle-orm';
import { getDrizzle } from '../db/drizzle';
import { savedFilters } from '../db/schema';
import type {
  SavedFilter,
  SavedFilterCreateInput,
  SavedFilterUpdateInput,
} from '../../shared/schemas/savedFilters';

/**
 * Saved filters service. Follows the same conventions as projects —
 * UUIDv7 ids, ISO-8601 timestamps, server-side max-order append.
 * Syntax validation of the expression happens at the IPC boundary
 * via Zod (see schemas/savedFilters.ts), so by the time we land here
 * the expression is guaranteed parseable.
 */

function nowIso(): string {
  return new Date().toISOString();
}

async function getById(id: string): Promise<SavedFilter | null> {
  const db = getDrizzle();
  const rows = await db
    .select()
    .from(savedFilters)
    .where(eq(savedFilters.id, id))
    .limit(1);
  return (rows[0] as SavedFilter | undefined) ?? null;
}

async function nextOrder(): Promise<number> {
  const db = getDrizzle();
  const rows = await db
    .select({ max: sql<number>`COALESCE(MAX(${savedFilters.order}), 0)` })
    .from(savedFilters);
  const current = rows[0]?.max ?? 0;
  return current + 1;
}

export const savedFiltersService = {
  async create(input: SavedFilterCreateInput): Promise<SavedFilter> {
    const db = getDrizzle();
    const now = nowIso();
    const row: SavedFilter = {
      id: uuidv7(),
      name: input.name,
      expression: input.expression,
      color: input.color ?? null,
      order: await nextOrder(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(savedFilters).values(row);
    return row;
  },

  get(id: string): Promise<SavedFilter | null> {
    return getById(id);
  },

  async list(): Promise<readonly SavedFilter[]> {
    const db = getDrizzle();
    const rows = await db
      .select()
      .from(savedFilters)
      .orderBy(asc(savedFilters.order));
    return rows as SavedFilter[];
  },

  async update(input: SavedFilterUpdateInput): Promise<SavedFilter | null> {
    const db = getDrizzle();
    const patch = { ...input.patch, updatedAt: nowIso() };
    await db
      .update(savedFilters)
      .set(patch)
      .where(eq(savedFilters.id, input.id));
    return getById(input.id);
  },

  async delete(id: string): Promise<void> {
    const db = getDrizzle();
    await db.delete(savedFilters).where(eq(savedFilters.id, id));
  },
} as const;
