import { v7 as uuidv7 } from 'uuid';
import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import { getDrizzle } from '../db/drizzle';
import { notes } from '../db/schema';
import type {
  Note,
  NoteCreateInput,
  NoteListInput,
  NoteUpdateInput,
} from '../../shared/schemas/notes';

/**
 * Notes service.
 *
 * The persistence layer for the notes domain. All schema mapping happens
 * here — IPC handlers and the service share the same Note shape, so what
 * the renderer sees is exactly what Drizzle returns.
 *
 * Conventions:
 *   - IDs are generated server-side (main process) using UUIDv7 so they
 *     are time-sortable and sync-friendly (§7.1).
 *   - Timestamps are UTC ISO-8601 strings produced by `new Date().toISOString()`.
 *   - Soft-delete (§7.2): `delete()` sets `deleted_at`; reads default to
 *     `WHERE deleted_at IS NULL` unless `includeDeleted` is set.
 *   - Empty body input is normalised to '' so the column NOT NULL constraint
 *     is satisfied even when the caller omits the field.
 */

function nowIso(): string {
  return new Date().toISOString();
}

async function getById(id: string): Promise<Note | null> {
  const db = getDrizzle();
  const rows = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
  return (rows[0] as Note | undefined) ?? null;
}

export const notesService = {
  async create(input: NoteCreateInput): Promise<Note> {
    const db = getDrizzle();
    const now = nowIso();
    const row: Note = {
      id: uuidv7(),
      title: input.title,
      body: input.body ?? '',
      folderId: input.folderId ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await db.insert(notes).values(row);
    return row;
  },

  get(id: string): Promise<Note | null> {
    return getById(id);
  },

  async list(input: NoteListInput): Promise<readonly Note[]> {
    const db = getDrizzle();

    const conditions: SQL[] = [];
    if (!input.includeDeleted) conditions.push(isNull(notes.deletedAt));
    if (input.folderId !== undefined) {
      conditions.push(
        input.folderId === null
          ? isNull(notes.folderId)
          : eq(notes.folderId, input.folderId),
      );
    }

    const where = conditions.length === 0 ? undefined : and(...conditions);
    const limit = input.limit ?? 500; // generous default, capped at 1000 in schema

    const rows = await db
      .select()
      .from(notes)
      .where(where)
      .orderBy(desc(notes.updatedAt))
      .limit(limit);

    return rows as Note[];
  },

  async update(input: NoteUpdateInput): Promise<Note | null> {
    const db = getDrizzle();

    // Always bump updated_at so the patch is observable even when the body
    // diff is empty — important for the auto-save "touch" pattern.
    const patch = { ...input.patch, updatedAt: nowIso() };
    await db.update(notes).set(patch).where(eq(notes.id, input.id));

    return getById(input.id);
  },

  async delete(id: string): Promise<void> {
    const db = getDrizzle();
    // Soft-delete: stamp deleted_at; hard delete runs separately on a schedule.
    await db.update(notes).set({ deletedAt: nowIso() }).where(eq(notes.id, id));
  },
} as const;
