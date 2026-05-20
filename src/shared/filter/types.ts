/**
 * Filter DSL — shared types across the lex / parse / compile stages.
 *
 * The DSL covers the saved-query language documented in §6.2:
 *   today, tomorrow, overdue, upcoming, no-date, completed, inbox
 *   p1, p2, p3, p4         (priority equality)
 *   #projectname           (project, case-insensitive name lookup)
 *   @labelname             (label, case-insensitive name lookup)
 *   &  |  !  ( )            (combinators)
 *
 * Precedence (highest to lowest):  ! → & → |
 *
 * `a & b | c` parses as `(a & b) | c`. `!a & b` as `(!a) & b`.
 */

// ── Tokens (lexer output) ───────────────────────────────────────────────────

export type AtomKeyword =
  | 'today'
  | 'tomorrow'
  | 'overdue'
  | 'upcoming'
  | 'no-date'
  | 'completed'
  | 'inbox';

export const ATOM_KEYWORDS: ReadonlySet<AtomKeyword> = new Set([
  'today',
  'tomorrow',
  'overdue',
  'upcoming',
  'no-date',
  'completed',
  'inbox',
]);

export type Priority = 1 | 2 | 3 | 4;

export type Token =
  | { kind: 'keyword'; value: AtomKeyword; pos: number }
  | { kind: 'priority'; value: Priority; pos: number }
  | { kind: 'project'; name: string; pos: number }
  | { kind: 'label'; name: string; pos: number }
  | { kind: 'and'; pos: number }
  | { kind: 'or'; pos: number }
  | { kind: 'not'; pos: number }
  | { kind: 'lparen'; pos: number }
  | { kind: 'rparen'; pos: number };

// ── AST (parser output) ─────────────────────────────────────────────────────

export type FilterAst =
  | { kind: 'and'; left: FilterAst; right: FilterAst }
  | { kind: 'or'; left: FilterAst; right: FilterAst }
  | { kind: 'not'; child: FilterAst }
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'overdue' }
  | { kind: 'upcoming' }
  | { kind: 'noDate' }
  | { kind: 'completed' }
  | { kind: 'inbox' }
  | { kind: 'priority'; value: Priority }
  | { kind: 'project'; name: string }
  | { kind: 'label'; name: string };

// ── Compiler output ─────────────────────────────────────────────────────────

export interface SqlFragment {
  /** SQL fragment with `?` placeholders. Safe to interpolate into a WHERE. */
  readonly sql: string;
  /** Bound parameters in placeholder order. Never strings from user input. */
  readonly params: readonly unknown[];
}

// ── Errors ──────────────────────────────────────────────────────────────────

export class FilterSyntaxError extends Error {
  /** Position in the input string the error refers to. */
  readonly pos: number;
  constructor(message: string, pos: number) {
    super(`Filter syntax error at position ${pos}: ${message}`);
    this.name = 'FilterSyntaxError';
    this.pos = pos;
  }
}
