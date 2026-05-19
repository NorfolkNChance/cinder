import { z } from 'zod';

/**
 * Zod schemas for sections. Sections always belong to a project — the
 * project_id is required on every input.
 */

const ISO_8601 = z.string().datetime({ offset: false });
const Uuid = z.string().uuid();

export const Section = z.object({
  id: Uuid,
  projectId: Uuid,
  name: z.string(),
  order: z.number().int(),
  createdAt: ISO_8601,
  updatedAt: ISO_8601,
});
export type Section = z.infer<typeof Section>;

export const SectionCreateInput = z.object({
  projectId: Uuid,
  name: z.string().min(1).max(200),
});
export type SectionCreateInput = z.infer<typeof SectionCreateInput>;

export const SectionListInput = z.object({
  projectId: Uuid,
});
export type SectionListInput = z.infer<typeof SectionListInput>;

export const SectionUpdateInput = z.object({
  id: Uuid,
  patch: z
    .object({
      name: z.string().min(1).max(200).optional(),
      order: z.number().int().optional(),
      // project_id is fixed once a section is created — moving a section
      // between projects has subtle semantics (what about its tasks?) so
      // it's out of scope here. Delete + recreate if you need to move.
    })
    .strict(),
});
export type SectionUpdateInput = z.infer<typeof SectionUpdateInput>;

export const SectionDeleteInput = z.object({ id: Uuid });
export type SectionDeleteInput = z.infer<typeof SectionDeleteInput>;
