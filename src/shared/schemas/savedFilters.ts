import { z } from 'zod';
import { lex } from '../filter/lex';
import { parse } from '../filter/parse';
import { FilterSyntaxError } from '../filter/types';

/**
 * Saved filter schemas.
 *
 * Expressions are validated at the IPC boundary — the lex+parse pipeline
 * runs at .parse() time, so the service layer can trust that anything
 * past Zod is syntactically valid. The trade-off: a syntax error during
 * create surfaces as a Zod failure (rejected promise on the renderer
 * side), not a custom error. The renderer extracts the message.
 *
 * Note we don't run `compile` here — compile needs a `now` reference
 * and we don't want to bake that into the validation. The compile step
 * is deterministic given a parseable AST, so validation is sufficient.
 */

const ISO_8601 = z.string().datetime({ offset: false });
const Uuid = z.string().uuid();
const Color = z.string().regex(/^#?[0-9a-fA-F]{6}$/);

const Expression = z
  .string()
  .min(1, { message: 'expression is empty' })
  .max(500)
  .refine(
    (s) => {
      try {
        parse(lex(s));
        return true;
      } catch (e) {
        return !(e instanceof FilterSyntaxError) ? false : false;
      }
    },
    (s) => {
      // Re-run to pull out the specific message — this only fires when
      // the refine above returned false, so we know it throws.
      try {
        parse(lex(s));
        return { message: 'invalid filter expression' };
      } catch (e) {
        return {
          message:
            e instanceof Error ? e.message : 'invalid filter expression',
        };
      }
    },
  );

export const SavedFilter = z.object({
  id: Uuid,
  name: z.string(),
  expression: z.string(),
  color: z.string().nullable(),
  order: z.number().int(),
  createdAt: ISO_8601,
  updatedAt: ISO_8601,
});
export type SavedFilter = z.infer<typeof SavedFilter>;

export const SavedFilterCreateInput = z.object({
  name: z.string().min(1).max(100),
  expression: Expression,
  color: Color.nullable().optional(),
});
export type SavedFilterCreateInput = z.infer<typeof SavedFilterCreateInput>;

export const SavedFilterGetInput = z.object({ id: Uuid });
export type SavedFilterGetInput = z.infer<typeof SavedFilterGetInput>;

export const SavedFilterListInput = z.object({});
export type SavedFilterListInput = z.infer<typeof SavedFilterListInput>;

export const SavedFilterUpdateInput = z.object({
  id: Uuid,
  patch: z
    .object({
      name: z.string().min(1).max(100).optional(),
      expression: Expression.optional(),
      color: Color.nullable().optional(),
      order: z.number().int().optional(),
    })
    .strict(),
});
export type SavedFilterUpdateInput = z.infer<typeof SavedFilterUpdateInput>;

export const SavedFilterDeleteInput = z.object({ id: Uuid });
export type SavedFilterDeleteInput = z.infer<typeof SavedFilterDeleteInput>;
