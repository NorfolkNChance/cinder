import { FilterSyntaxError, type FilterAst, type Token } from './types';

/**
 * Parser for the filter DSL. Recursive-descent over the token stream
 * produced by `lex`. Grammar (precedence climbs top-to-bottom):
 *
 *   expr      ::=  or_expr
 *   or_expr   ::=  and_expr ('|' and_expr)*
 *   and_expr  ::=  not_expr ('&' not_expr)*
 *   not_expr  ::=  '!' not_expr | atom
 *   atom      ::=  keyword | priority | project | label | '(' expr ')'
 *
 * Left-associative `&` and `|` are built as left-leaning AST nodes —
 * the compiler emits `(a) AND (b) AND (c)` as `((a AND b) AND c)`,
 * which SQLite is happy with.
 */
export function parse(tokens: readonly Token[]): FilterAst {
  if (tokens.length === 0) {
    throw new FilterSyntaxError('filter is empty', 0);
  }
  const parser = new Parser(tokens);
  const ast = parser.parseExpr();
  if (!parser.atEnd()) {
    throw new FilterSyntaxError(
      `unexpected token after expression`,
      parser.peekPos(),
    );
  }
  return ast;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: readonly Token[]) {}

  atEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  peekPos(): number {
    const t = this.tokens[this.pos];
    return t === undefined ? -1 : t.pos;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    if (t === undefined) {
      throw new FilterSyntaxError('unexpected end of input', -1);
    }
    this.pos += 1;
    return t;
  }

  parseExpr(): FilterAst {
    return this.parseOr();
  }

  private parseOr(): FilterAst {
    let left = this.parseAnd();
    while (this.peek()?.kind === 'or') {
      this.advance();
      const right = this.parseAnd();
      left = { kind: 'or', left, right };
    }
    return left;
  }

  private parseAnd(): FilterAst {
    let left = this.parseNot();
    while (this.peek()?.kind === 'and') {
      this.advance();
      const right = this.parseNot();
      left = { kind: 'and', left, right };
    }
    return left;
  }

  private parseNot(): FilterAst {
    if (this.peek()?.kind === 'not') {
      this.advance();
      const child = this.parseNot();
      return { kind: 'not', child };
    }
    return this.parseAtom();
  }

  private parseAtom(): FilterAst {
    const tok = this.peek();
    if (tok === undefined) {
      throw new FilterSyntaxError('unexpected end of input', -1);
    }

    if (tok.kind === 'lparen') {
      this.advance();
      const inner = this.parseExpr();
      const close = this.peek();
      if (close?.kind !== 'rparen') {
        throw new FilterSyntaxError(
          "missing ')' to close group",
          close?.pos ?? tok.pos,
        );
      }
      this.advance();
      return inner;
    }

    if (tok.kind === 'keyword') {
      this.advance();
      return keywordAst(tok.value);
    }

    if (tok.kind === 'priority') {
      this.advance();
      return { kind: 'priority', value: tok.value };
    }

    if (tok.kind === 'project') {
      this.advance();
      return { kind: 'project', name: tok.name };
    }

    if (tok.kind === 'label') {
      this.advance();
      return { kind: 'label', name: tok.name };
    }

    throw new FilterSyntaxError(`unexpected token '${tok.kind}'`, tok.pos);
  }
}

function keywordAst(
  kw:
    | 'today'
    | 'tomorrow'
    | 'overdue'
    | 'upcoming'
    | 'no-date'
    | 'completed'
    | 'inbox',
): FilterAst {
  switch (kw) {
    case 'today':
      return { kind: 'today' };
    case 'tomorrow':
      return { kind: 'tomorrow' };
    case 'overdue':
      return { kind: 'overdue' };
    case 'upcoming':
      return { kind: 'upcoming' };
    case 'no-date':
      return { kind: 'noDate' };
    case 'completed':
      return { kind: 'completed' };
    case 'inbox':
      return { kind: 'inbox' };
  }
}

/**
 * True if the AST refers to a completion-related predicate anywhere.
 * Used by the service layer to decide whether to AND-in the default
 * "active tasks only" filter — if the user mentioned `completed`,
 * they want to see them and the default would be wrong.
 */
export function mentionsCompletion(ast: FilterAst): boolean {
  switch (ast.kind) {
    case 'completed':
      return true;
    case 'and':
    case 'or':
      return mentionsCompletion(ast.left) || mentionsCompletion(ast.right);
    case 'not':
      return mentionsCompletion(ast.child);
    default:
      return false;
  }
}
