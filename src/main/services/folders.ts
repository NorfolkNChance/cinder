import { v7 as uuidv7 } from 'uuid';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { getDrizzle } from '../db/drizzle';
import { folders, notes } from '../db/schema';
import type {
  Folder,
  FolderCreateInput,
  FolderListInput,
  FolderUpdateInput,
} from '../../shared/schemas/folders';

function nowIso(): string {
  return new Date().toISOString();
}

async function getById(id: string): Promise<Folder | null> {
  const db = getDrizzle();
  const rows = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
  return (rows[0] as Folder | undefined) ?? null;
}

export const foldersService = {
  async create(input: FolderCreateInput): Promise<Folder> {
    const db = getDrizzle();
    const now = nowIso();

    // Determine the next order value within the parent level.
    const siblings = await db
      .select({ order: folders.order })
      .from(folders)
      .where(
        input.parentId
          ? eq(folders.parentId, input.parentId)
          : isNull(folders.parentId),
      );
    const maxOrder = siblings.reduce((m, s) => Math.max(m, s.order), -1);

    const row: Folder = {
      id: uuidv7(),
      name: input.name,
      parentId: input.parentId ?? null,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(folders).values(row);
    return row;
  },

  async get(id: string): Promise<Folder | null> {
    return getById(id);
  },

  /**
   * List folders. Without a parentId filter, returns ALL folders (useful for
   * building the full tree in the renderer). Pass `parentId: null` to get
   * only top-level folders; pass a UUID to get children of that folder.
   */
  async list(input: FolderListInput): Promise<readonly Folder[]> {
    const db = getDrizzle();

    const where =
      input.parentId === undefined
        ? undefined // return everything — renderer builds the tree
        : input.parentId === null
        ? isNull(folders.parentId)
        : eq(folders.parentId, input.parentId);

    const rows = await db
      .select()
      .from(folders)
      .where(where)
      .orderBy(asc(folders.order), asc(folders.name));

    return rows as Folder[];
  },

  async update(input: FolderUpdateInput): Promise<Folder | null> {
    const db = getDrizzle();
    const patch = { ...input.patch, updatedAt: nowIso() };
    await db.update(folders).set(patch).where(eq(folders.id, input.id));
    return getById(input.id);
  },

  /**
   * Delete a folder.
   *
   * Rules:
   *  - Folders with sub-folders cannot be deleted; callers must delete the
   *    children first (returns an error string instead of throwing).
   *  - Notes in the folder are moved to "Unfiled" (folderId = null).
   */
  async delete(
    id: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const db = getDrizzle();

    // Block if the folder has children.
    const children = await db
      .select({ id: folders.id })
      .from(folders)
      .where(eq(folders.parentId, id))
      .limit(1);

    if (children.length > 0) {
      return {
        ok: false,
        reason: 'This folder has sub-folders. Delete them first.',
      };
    }

    // Move notes in this folder to Unfiled.
    await db
      .update(notes)
      .set({ folderId: null, updatedAt: nowIso() })
      .where(and(eq(notes.folderId, id), isNull(notes.deletedAt)));

    // Delete the folder itself.
    await db.delete(folders).where(eq(folders.id, id));

    return { ok: true };
  },

  /** Count notes directly inside a folder (for confirmation dialogs). */
  async countNotes(folderId: string): Promise<number> {
    const db = getDrizzle();
    const rows = await db
      .select({ id: notes.id })
      .from(notes)
      .where(
        and(
          eq(notes.folderId, folderId),
          isNull(notes.deletedAt),
          or(isNull(notes.dailyDate)),
        ),
      );
    return rows.length;
  },
};
