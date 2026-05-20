import { z } from 'zod';

/**
 * Zod schemas for labels — flat, cross-cutting tags attached to tasks
 * through the task_labels join. Names are unique-by-lowercase at the
 * service layer; the schemas here are concerned with shape only.
 */

const ISO_8601 = z.string().datetime({ offset: false });
const Uuid = z.string().uuid();
const Color = z.string().regex(/^#?[0-9a-fA-F]{6}$/);

export const Label = z.object({
  id: Uuid,
  name: z.string(),
  color: z.string().nullable(),
  createdAt: ISO_8601,
  updatedAt: ISO_8601,
});
export type Label = z.infer<typeof Label>;

export const LabelCreateInput = z.object({
  // Names are constrained to "tag-shaped" strings to keep them
  // compatible with the quick-add @-syntax. Spaces, slashes, and other
  // punctuation would silently break the parser's @\w+ pattern.
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[\p{L}\p{N}_-]+$/u, {
      message: 'letters, digits, underscore or hyphen only',
    }),
  color: Color.nullable().optional(),
});
export type LabelCreateInput = z.infer<typeof LabelCreateInput>;

export const LabelGetInput = z.object({ id: Uuid });
export type LabelGetInput = z.infer<typeof LabelGetInput>;

export const LabelListInput = z.object({});
export type LabelListInput = z.infer<typeof LabelListInput>;

export const LabelUpdateInput = z.object({
  id: Uuid,
  patch: z
    .object({
      name: z
        .string()
        .min(1)
        .max(50)
        .regex(/^[\p{L}\p{N}_-]+$/u)
        .optional(),
      color: Color.nullable().optional(),
    })
    .strict(),
});
export type LabelUpdateInput = z.infer<typeof LabelUpdateInput>;

export const LabelDeleteInput = z.object({ id: Uuid });
export type LabelDeleteInput = z.infer<typeof LabelDeleteInput>;

/**
 * Replace the set of labels attached to a task. Atomic — the service
 * deletes any rows not in `labelIds` and inserts any that aren't yet
 * present, all inside a transaction.
 */
export const LabelsSetForTaskInput = z.object({
  taskId: Uuid,
  labelIds: z.array(Uuid).max(50),
});
export type LabelsSetForTaskInput = z.infer<typeof LabelsSetForTaskInput>;
