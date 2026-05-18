import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

/**
 * Notes table.
 *
 * Schema conventions (see ARCHITECTURE.md §7):
 *   - IDs are UUIDv7 (time-sortable, sync-friendly) generated in application
 *     code. Stored as TEXT.
 *   - Timestamps are UTC ISO-8601 strings stored as TEXT (§7.1). Converted at
 *     the UI boundary only.
 *   - Soft deletes via `deleted_at` (§7.2). Hard delete runs on a separate
 *     schedule. All read queries must filter `WHERE deleted_at IS NULL`.
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
    // Most list queries are "non-deleted, ordered by recency".
    deletedAtIdx: index('notes_deleted_at_idx').on(table.deletedAt),
    updatedAtIdx: index('notes_updated_at_idx').on(table.updatedAt),
  }),
);

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
