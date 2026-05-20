import { compile, type CompileContext } from './compile';
import { lex } from './lex';
import { mentionsCompletion, parse } from './parse';
import type { FilterAst, SqlFragment } from './types';

export { FilterSyntaxError } from './types';
export type {
  AtomKeyword,
  FilterAst,
  Priority,
  SqlFragment,
  Token,
} from './types';
export { lex } from './lex';
export { parse, mentionsCompletion } from './parse';
export { compile, type CompileContext } from './compile';

/**
 * Convenience: lex → parse → compile in one call. Returns the SQL
 * fragment plus a flag indicating whether the filter references
 * completion status (so the service can suppress its default
 * "active tasks only" AND-condition when needed).
 */
export function filterToSql(
  input: string,
  ctx: CompileContext = {},
): { fragment: SqlFragment; mentionsCompleted: boolean; ast: FilterAst } {
  const tokens = lex(input);
  const ast = parse(tokens);
  return {
    fragment: compile(ast, ctx),
    mentionsCompleted: mentionsCompletion(ast),
    ast,
  };
}
