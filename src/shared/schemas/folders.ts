import { z } from 'zod';

const FolderId = z.string().uuid();
const ISO_8601 = z.string().datetime({ offset: false });

// ── Canonical shape ───────────────────────────────────────────────────────────

export const Folder = z.object({
  id: FolderId,
  name: z.string(),
  parentId: FolderId.nullable(),
  order: z.number().int(),
  createdAt: ISO_8601,
  updatedAt: ISO_8601,
});
export type Folder = z.infer<typeof Folder>;

// ── Inputs ────────────────────────────────────────────────────────────────────

export const FolderCreateInput = z.object({
  name: z.string().min(1).max(200),
  /** Omit or null for a top-level folder. */
  parentId: FolderId.nullable().optional(),
});
export type FolderCreateInput = z.infer<typeof FolderCreateInput>;

export const FolderGetInput = z.object({ id: FolderId });
export type FolderGetInput = z.infer<typeof FolderGetInput>;

export const FolderListInput = z.object({
  /** When provided, return only children of this parent. null = top-level only. */
  parentId: FolderId.nullable().optional(),
});
export type FolderListInput = z.infer<typeof FolderListInput>;

export const FolderUpdateInput = z.object({
  id: FolderId,
  patch: z
    .object({
      name: z.string().min(1).max(200).optional(),
      parentId: FolderId.nullable().optional(),
      order: z.number().int().optional(),
    })
    .strict(),
});
export type FolderUpdateInput = z.infer<typeof FolderUpdateInput>;

export const FolderDeleteInput = z.object({ id: FolderId });
export type FolderDeleteInput = z.infer<typeof FolderDeleteInput>;
