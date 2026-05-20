import {
  ATOM_KEYWORDS,
  FilterSyntaxError,
  type AtomKeyword,
  type Priority,
  type Token,
} from './types';

/**
 * Lexer for the filter DSL. Walks the input once and produces a token
 * stream. Errors throw `FilterSyntaxError` with the offending position.
 *
 * Tokens are recognised by leading-character dispatch:
 *   '&'  '|'  '!'  '('  ')'   → operator / paren
 *   '#'  '@'                  → project / label, followed by [\w-]+
 *   alpha                     → identifier; checked against:
 *                                 - "pN" (N in 1..4) → priority
 *                                 - keywords          → keyword
 *                                 - otherwise         → error
 * Other characters are syntax errors.
 *
 * Identifiers/tag bodies accept letters, digits, underscore and hyphen
 * (matches the label name regex from the labels schema; project names
 * use the same alphabet for tagging purposes).
 */
export function lex(input: string): readonly Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === undefined) break;

    // Skip whitespace.
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i += 1;
      continue;
    }

    // Operators / parens.
    if (c === '&') {
      tokens.push({ kind: 'and', pos: i });
      i += 1;
      continue;
    }
    if (c === '|') {
      tokens.push({ kind: 'or', pos: i });
      i += 1;
      continue;
    }
    if (c === '!') {
      tokens.push({ kind: 'not', pos: i });
      i += 1;
      continue;
    }
    if (c === '(') {
      tokens.push({ kind: 'lparen', pos: i });
      i += 1;
      continue;
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen', pos: i });
      i += 1;
      continue;
    }

    // Project / label tags.
    if (c === '#' || c === '@') {
      const start = i;
      i += 1;
      const nameStart = i;
      while (i < input.length && isTagChar(input[i]!)) i += 1;
      if (i === nameStart) {
        throw new FilterSyntaxError(`empty ${c === '#' ? 'project' : 'label'} tag`, start);
      }
      const name = input.slice(nameStart, i);
      tokens.push(
        c === '#'
          ? { kind: 'project', name, pos: start }
          : { kind: 'label', name, pos: start },
      );
      continue;
    }

    // Identifiers — keyword or priority.
    if (isIdentStart(c)) {
      const start = i;
      while (i < input.length && isIdentChar(input[i]!)) i += 1;
      const word = input.slice(start, i);
      tokens.push(classifyIdent(word, start));
      continue;
    }

    throw new FilterSyntaxError(`unexpected character '${c}'`, i);
  }
  return tokens;
}

function isIdentStart(c: string): boolean {
  return /^[A-Za-z]$/.test(c);
}

function isIdentChar(c: string): boolean {
  // Keywords like `no-date` include a hyphen; allow it inside.
  return /^[A-Za-z0-9-]$/.test(c);
}

function isTagChar(c: string): boolean {
  // Mirrors the LabelCreateInput name regex (letters/digits/_/-, plus
  // Unicode letters/numbers — though those are rare in filter input).
  return /^[\p{L}\p{N}_-]$/u.test(c);
}

/**
 * Decide whether an identifier is a priority (`p1`..`p4`) or a keyword
 * (`today`, `overdue`, …). Anything else throws — bare words have no
 * place in the DSL.
 */
function classifyIdent(word: string, pos: number): Token {
  const lower = word.toLowerCase();

  // Priority: `p1` through `p4`.
  const pri = /^p([1-4])$/.exec(lower);
  if (pri !== null) {
    return {
      kind: 'priority',
      value: Number(pri[1]) as Priority,
      pos,
    };
  }

  if (ATOM_KEYWORDS.has(lower as AtomKeyword)) {
    return { kind: 'keyword', value: lower as AtomKeyword, pos };
  }

  throw new FilterSyntaxError(`unknown keyword '${word}'`, pos);
}
