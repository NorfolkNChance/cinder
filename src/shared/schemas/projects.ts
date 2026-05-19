import { z } from 'zod';

/**
 * Zod schemas for the projects domain. See notes.ts for the conventions
 * — these schemas follow the same shape (canonical type + per-operation
 * Input types validated at the IPC boundary).
 */

const ISO_8601 = z.string().datetime({ offset: false });
const Uuid = z.string().uuid();
// 6-digit hex with leading # (optional). Kept liberal — the renderer
// only uses a small palette but the column is open-ended for the future.
const Color = z.string().regex(/^#?[0-9a-fA-F]{6}$/);

export const Project = z.object({
  id: Uuid,
  name: z.string(),
  parentId: Uuid.nullable(),
  color: z.string().nullable(),
  order: z.number().int(),
  archivedAt: ISO_8601.nullable(),
  createdAt: ISO_8601,
  updatedAt: ISO_8601,
});
export type Project = z.infer<typeof Project>;

export const ProjectCreateInput = z.object({
  name: z.string().min(1).max(200),
  parentId: Uuid.nullable().optional(),
  color: Color.nullable().optional(),
});
export type ProjectCreateInput = z.infer<typeof ProjectCreateInput>;

export const ProjectGetInput = z.object({ id: Uuid });
export type ProjectGetInput = z.infer<typeof ProjectGetInput>;

export const ProjectListInput = z.object({
  // Archived projects are typically hidden — set true to include them.
  includeArchived: z.boolean().optional(),
});
export type ProjectListInput = z.infer<typeof ProjectListInput>;

export const ProjectUpdateInput = z.object({
  id: Uuid,
  patch: z
    .object({
      name: z.string().min(1).max(200).optional(),
      parentId: Uuid.nullable().optional(),
      color: Color.nullable().optional(),
      order: z.number().int().optional(),
      // archived_at is set via a separate `archive` / `unarchive` action;
      // not patchable directly so the rest of the patch surface stays clean.
    })
    .strict(),
});
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateInput>;

export const ProjectArchiveInput = z.object({
  id: Uuid,
  // True = archive (sets archived_at = now); false = unarchive (sets null).
  archived: z.boolean(),
});
export type ProjectArchiveInput = z.infer<typeof ProjectArchiveInput>;

export const ProjectDeleteInput = z.object({ id: Uuid });
export type ProjectDeleteInput = z.infer<typeof ProjectDeleteInput>;
