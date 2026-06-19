import { z } from 'zod';

/**
 * Zod schemas for the notes domain.
 *
 * Convention (§3.4): every IPC payload is validated at the main-process
 * handler boundary before reaching any business logic. The schemas in this
 * file are the authoritative contracts. Schema failure produces a typed
 * error and is logged.
 *
 * Timestamps are UTC ISO-8601 strings (§7.1). IDs are UUIDv7 — they pass
 * the generic UUID regex check Zod uses.
 */

const ISO_8601 = z.string().datetime({ offset: false });
const NoteId = z.string().uuid();
const FolderId = z.string().uuid().nullable();
const ProjectId = z.string().uuid().nullable();
const DailyDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const BodyType = z.enum(['markdown', 'html']);

// ── Canonical note shape (returned by the service) ──────────────────────────
export const Note = z.object({
  id: NoteId,
  title: z.string(),
  body: z.string(),
  /** 'markdown' (default) or 'html'. Determines which editor is shown. */
  bodyType: BodyType.default('markdown'),
  folderId: FolderId,
  /** Optional project membership. null = not assigned to any project. */
  projectId: ProjectId,
  /** NULL for regular notes; 'YYYY-MM-DD' for daily notes. */
  dailyDate: DailyDate.nullable(),
  createdAt: ISO_8601,
  updatedAt: ISO_8601,
  deletedAt: ISO_8601.nullable(),
});
export type Note = z.infer<typeof Note>;

// ── Inputs ──────────────────────────────────────────────────────────────────

export const NoteCreateInput = z.object({
  // Empty title is permitted — the UI shows "Untitled" as a placeholder
  // and the user fills it in once they have a working title in mind. The
  // 500-char upper bound is the meaningful safety constraint.
  title: z.string().max(500),
  // The body upper bound (1MB chars) matches §3.4 worked example. The default
  // empty string is applied by the service so an explicit "" is unambiguous.
  body: z.string().max(1_000_000).optional(),
  /** 'markdown' (default) or 'html'. Set to 'html' when importing an HTML file. */
  bodyType: BodyType.optional(),
  folderId: FolderId.optional(),
  /** Optional project membership at creation time. */
  projectId: ProjectId.optional(),
  /** Omit for regular notes; supply 'YYYY-MM-DD' to create a daily note. */
  dailyDate: DailyDate.nullable().optional(),
});
export type NoteCreateInput = z.infer<typeof NoteCreateInput>;

export const NoteGetInput = z.object({
  id: NoteId,
});
export type NoteGetInput = z.infer<typeof NoteGetInput>;

export const NoteListInput = z.object({
  // Default: hide soft-deleted notes. Set true to include them (e.g. trash view).
  includeDeleted: z.boolean().optional(),
  // Filter by folder. `null` means "notes not in any folder"; omit to match any.
  folderId: FolderId.optional(),
  // Filter by project. `null` means "notes not in any project"; omit to match any.
  projectId: ProjectId.optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  /**
   * When true: return only daily notes (daily_date IS NOT NULL).
   * When false/omitted: return only regular notes (daily_date IS NULL).
   */
  dailyOnly: z.boolean().optional(),
});
export type NoteListInput = z.infer<typeof NoteListInput>;

/**
 * Get or create the daily note for a specific calendar date.
 * Returns the existing note if one already exists, otherwise creates a
 * blank note and returns it. Idempotent — safe to call on every navigation.
 */
export const NoteGetOrCreateDailyInput = z.object({
  date: DailyDate,
});
export type NoteGetOrCreateDailyInput = z.infer<typeof NoteGetOrCreateDailyInput>;

export const NoteUpdateInput = z.object({
  id: NoteId,
  // Partial patch — only the keys present are written. Empty patch is a no-op
  // (but still bumps updated_at so it can serve as a "touch").
  patch: z
    .object({
      title: z.string().max(500).optional(),
      body: z.string().max(1_000_000).optional(),
      folderId: FolderId.optional(),
      projectId: ProjectId.optional(),
    })
    .strict(),
});
export type NoteUpdateInput = z.infer<typeof NoteUpdateInput>;

export const NoteDeleteInput = z.object({
  id: NoteId,
});
export type NoteDeleteInput = z.infer<typeof NoteDeleteInput>;

export const NoteFindByTitleInput = z.object({
  title: z.string().max(500),
});
export type NoteFindByTitleInput = z.infer<typeof NoteFindByTitleInput>;

export const NoteSearchInput = z.object({
  // Free-text query. The service sanitises this into a safe FTS5 MATCH
  // expression (prefix-match for clean tokens, phrase-match for tokens
  // with punctuation) — callers must not pre-compose FTS5 syntax.
  query: z.string().max(500),
  limit: z.number().int().min(1).max(200).optional(),
});
export type NoteSearchInput = z.infer<typeof NoteSearchInput>;
