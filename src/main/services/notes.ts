import { v7 as uuidv7 } from 'uuid';
import { and, desc, eq, gte, isNotNull, isNull, ne, type SQL } from 'drizzle-orm';
import { getDb } from '../db/index';
import { getDrizzle } from '../db/drizzle';
import { folders, notes } from '../db/schema';
import { settingsService } from './settings';
import { deleteAttachmentsDir } from './attachments';
import type {
  Note,
  NoteCreateInput,
  NoteGetOrCreateDailyInput,
  NoteListDeletedInput,
  NoteListInput,
  NoteSearchInput,
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

/** Strip HTML tags from a string, leaving only text content. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Extract searchable text from an Excalidraw scene (bodyType 'excalidraw').
 * The body is scene JSON, which must never hit the FTS index raw — index only
 * the user-authored text elements. Returns '' if the body isn't parseable.
 */
function extractDrawingText(body: string): string {
  try {
    const scene = JSON.parse(body) as {
      elements?: { type?: string; text?: string }[];
    };
    if (!Array.isArray(scene.elements)) return '';
    return scene.elements
      .filter((el) => el.type === 'text' && typeof el.text === 'string')
      .map((el) => el.text)
      .join(' ')
      .trim();
  } catch {
    return '';
  }
}

/**
 * Update the FTS5 body for a note, bypassing the SQL trigger which always
 * writes the raw body. For HTML notes the trigger writes raw HTML; this
 * overwrites it with clean text so FTS5 searches and snippets are usable.
 */
function updateFtsBody(noteId: string, cleanBody: string): Promise<void> {
  const db = getDb();
  return new Promise<void>((resolve, reject) => {
    db.run(
      'UPDATE notes_fts SET body = ? WHERE note_id = ?',
      [cleanBody, noteId],
      (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      },
    );
  });
}

/**
 * Produce a human-readable title for a daily note from a YYYY-MM-DD string.
 * Examples: "Tuesday, 27 May 2026", "Monday, 1 January 2025".
 *
 * Parsing `date + 'T12:00:00'` (noon, no timezone suffix) avoids the
 * off-by-one that `new Date('2026-05-27')` causes in timezones west of UTC
 * (which would parse as the previous day in local time).
 */
function formatDailyTitle(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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
      bodyType: input.bodyType ?? 'markdown',
      folderId: input.folderId ?? null,
      projectId: input.projectId ?? null,
      dailyDate: input.dailyDate ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await db.insert(notes).values(row);

    // For HTML/drawing notes, overwrite the FTS body — the SQL trigger writes
    // the raw body (HTML markup / scene JSON) which pollutes search snippets.
    if (row.bodyType === 'html' && row.body) {
      await updateFtsBody(row.id, stripHtml(row.body));
    } else if (row.bodyType === 'excalidraw' && row.body) {
      await updateFtsBody(row.id, extractDrawingText(row.body));
    }

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
    if (input.projectId !== undefined) {
      conditions.push(
        input.projectId === null
          ? isNull(notes.projectId)
          : eq(notes.projectId, input.projectId),
      );
    }
    // Separate the note "kinds" by their distinguishing column. Callers opt in
    // to a single kind; the default returns regular notes only.
    //   - drawingsOnly → only drawings (body_type = 'excalidraw')
    //   - dailyOnly    → only daily notes (daily_date IS NOT NULL)
    //   - neither      → regular notes: exclude both daily AND drawings, so the
    //                    main Notes list stays text-only (mirrors daily).
    if (input.drawingsOnly) {
      conditions.push(eq(notes.bodyType, 'excalidraw'));
    } else if (input.dailyOnly) {
      conditions.push(isNotNull(notes.dailyDate));
    } else {
      conditions.push(isNull(notes.dailyDate));
      conditions.push(ne(notes.bodyType, 'excalidraw'));
    }

    // UTC ISO-8601 strings compare correctly lexicographically.
    if (input.updatedAfter !== undefined) {
      conditions.push(gte(notes.updatedAt, input.updatedAfter));
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

    // For HTML/drawing notes, overwrite the FTS body whenever body is part of
    // the patch. The SQL trigger always writes the raw body.
    const updated = await getById(input.id);
    if ('body' in patch && patch.body !== undefined) {
      if (updated?.bodyType === 'html') {
        await updateFtsBody(input.id, stripHtml(patch.body));
      } else if (updated?.bodyType === 'excalidraw') {
        await updateFtsBody(input.id, extractDrawingText(patch.body));
      }
    }

    return updated;
  },

  async delete(id: string): Promise<void> {
    const db = getDrizzle();
    // Soft-delete: stamp deleted_at. The note moves to Trash, where it can
    // be restored or hard-deleted; the purge job removes it after the
    // retention window (see services/purge.ts).
    await db.update(notes).set({ deletedAt: nowIso() }).where(eq(notes.id, id));
  },

  /**
   * All soft-deleted notes — every kind (regular, daily, HTML, drawings) —
   * for the Trash view, most recently deleted first.
   */
  async listDeleted(input: NoteListDeletedInput): Promise<readonly Note[]> {
    const db = getDrizzle();
    const rows = await db
      .select()
      .from(notes)
      .where(isNotNull(notes.deletedAt))
      .orderBy(desc(notes.deletedAt))
      .limit(input.limit ?? 500);
    return rows as Note[];
  },

  /**
   * Un-delete a trashed note. Two integrity repairs happen on the way out:
   *
   *   - `folder_id` is nulled if the folder no longer exists. Folder delete
   *     only re-files *live* notes (folders.ts), so a trashed note can hold
   *     a dangling folder reference — the FK is service-enforced, not
   *     DB-enforced (see CLAUDE.md gotchas).
   *   - `daily_date` is cleared if another live note now owns that date
   *     (the user deleted a daily note, then re-created it by visiting the
   *     date). The restored note comes back as a regular note instead of
   *     producing two daily notes for one day.
   */
  async restore(id: string): Promise<Note | null> {
    const db = getDrizzle();
    const note = await getById(id);
    if (!note || note.deletedAt === null) return note;

    let folderId = note.folderId;
    if (folderId !== null) {
      const folderRows = await db
        .select({ id: folders.id })
        .from(folders)
        .where(eq(folders.id, folderId))
        .limit(1);
      if (!folderRows[0]) folderId = null;
    }

    let dailyDate = note.dailyDate;
    if (dailyDate !== null) {
      const clash = await db
        .select({ id: notes.id })
        .from(notes)
        .where(
          and(
            eq(notes.dailyDate, dailyDate),
            isNull(notes.deletedAt),
            ne(notes.id, id),
          ),
        )
        .limit(1);
      if (clash[0]) dailyDate = null;
    }

    await db
      .update(notes)
      .set({ deletedAt: null, updatedAt: nowIso(), folderId, dailyDate })
      .where(eq(notes.id, id));
    return getById(id);
  },

  /**
   * Permanently delete a note. The row delete fires the FTS AFTER DELETE
   * trigger (index cleanup) and the note_task_links CASCADE; tasks that
   * were captured from this note keep running with source_note_id nulled
   * by the FK. The attachment directory is removed afterwards — if that
   * fails the orphaned files are unreferenced and harmless, so the DB
   * delete is not rolled back.
   */
  async hardDelete(id: string): Promise<void> {
    const db = getDrizzle();
    await db.delete(notes).where(eq(notes.id, id));
    try {
      deleteAttachmentsDir(id);
    } catch (err) {
      console.error(`[cinder] attachment cleanup failed for note ${id}:`, err);
    }
  },

  /**
   * Return the existing daily note for `date` (YYYY-MM-DD), or create a
   * blank one and return it. Idempotent — calling twice with the same date
   * always returns the same note id.
   */
  async getOrCreateDaily(input: NoteGetOrCreateDailyInput): Promise<Note> {
    const db = getDrizzle();

    // Look for an existing non-deleted daily note for this date.
    const existing = await db
      .select()
      .from(notes)
      .where(and(eq(notes.dailyDate, input.date), isNull(notes.deletedAt)))
      .limit(1);

    if (existing[0]) return existing[0] as Note;

    // Read template from settings — empty string means blank note.
    const settings = await settingsService.getAll();
    const body = settings['daily.template'];

    const now = nowIso();
    const row: Note = {
      id: uuidv7(),
      title: formatDailyTitle(input.date),
      body,
      bodyType: 'markdown',
      folderId: null,
      projectId: null,
      dailyDate: input.date,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await db.insert(notes).values(row);
    return row;
  },

  async findByTitle(title: string): Promise<Note | null> {
    const db = getDrizzle();
    const rows = await db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.title, title),
          isNull(notes.deletedAt),
          isNull(notes.dailyDate),
        ),
      )
      .limit(1);
    return (rows[0] as Note | undefined) ?? null;
  },

  search(input: NoteSearchInput): Promise<readonly Note[]> {
    const ftsQuery = buildFtsQuery(input.query);
    if (ftsQuery === null) return Promise.resolve([]);

    const limit = input.limit ?? 50;

    // FTS5 isn't expressible in Drizzle's schema (it's a virtual table), so
    // we drop to the raw @journeyapps/sqlcipher connection for this query.
    // Parameters are bound positionally — no user input is concatenated
    // into the SQL string. ORDER BY rank uses FTS5's built-in BM25 score
    // (lower = better in FTS5's convention). Column aliases map the
    // snake_case storage to the camelCase Note shape the rest of the
    // codebase expects.
    const db = getDb();
    return new Promise<readonly Note[]>((resolve, reject) => {
      db.all(
        `SELECT notes.id           AS id,
                notes.title        AS title,
                notes.body         AS body,
                notes.body_type    AS bodyType,
                notes.folder_id    AS folderId,
                notes.project_id   AS projectId,
                notes.daily_date   AS dailyDate,
                notes.created_at   AS createdAt,
                notes.updated_at   AS updatedAt,
                notes.deleted_at   AS deletedAt
           FROM notes
           JOIN notes_fts ON notes_fts.note_id = notes.id
          WHERE notes.deleted_at IS NULL
            AND notes_fts MATCH ?
          ORDER BY rank
          LIMIT ?`,
        [ftsQuery, limit],
        (err: Error | null, rows: unknown[]) => {
          if (err) reject(err);
          else resolve(rows as Note[]);
        },
      );
    });
  },
} as const;

/**
 * Convert a user-supplied free-text query into a safe FTS5 MATCH
 * expression. The strategy:
 *
 *   - Split on whitespace into tokens
 *   - For each token: if it's a single run of letters/digits, append `*`
 *     for prefix matching; otherwise wrap in double quotes (with internal
 *     double quotes doubled per FTS5 syntax) for a phrase match
 *   - AND the resulting fragments together
 *
 * This means typing "hel wor" matches a note containing "hello world",
 * while "don't" gets a phrase match because of the apostrophe. The
 * user never composes raw FTS5 syntax, so they can't trigger a parse
 * error or smuggle in a query that escapes the intended scope.
 *
 * Exported for unit testing — not part of the service's external surface.
 */
export function buildFtsQuery(raw: string): string | null {
  const tokens = raw.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return null;

  const fragments = tokens.map((token) => {
    if (/^[\p{L}\p{N}]+$/u.test(token)) {
      // Pure letters/digits — safe to append the prefix wildcard.
      return `${token}*`;
    }
    // Quote-escape any internal double quotes by doubling them (FTS5 syntax).
    const escaped = token.replace(/"/g, '""');
    return `"${escaped}"`;
  });

  return fragments.join(' AND ');
}
