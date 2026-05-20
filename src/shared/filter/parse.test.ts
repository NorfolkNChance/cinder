import { describe, expect, it } from 'vitest';
import { lex } from './lex';
import { mentionsCompletion, parse } from './parse';
import { FilterSyntaxError, type FilterAst } from './types';

function ast(input: string): FilterAst {
  return parse(lex(input));
}

describe('parse — atoms', () => {
  it('parses a single keyword', () => {
    expect(ast('today')).toEqual({ kind: 'today' });
  });

  it('parses no-date', () => {
    expect(ast('no-date')).toEqual({ kind: 'noDate' });
  });

  it('parses priority', () => {
    expect(ast('p1')).toEqual({ kind: 'priority', value: 1 });
  });

  it('parses project/label', () => {
    expect(ast('#work')).toEqual({ kind: 'project', name: 'work' });
    expect(ast('@urgent')).toEqual({ kind: 'label', name: 'urgent' });
  });
});

describe('parse — operators and precedence', () => {
  it('parses AND', () => {
    expect(ast('today & p1')).toEqual({
      kind: 'and',
      left: { kind: 'today' },
      right: { kind: 'priority', value: 1 },
    });
  });

  it('parses OR', () => {
    expect(ast('today | overdue')).toEqual({
      kind: 'or',
      left: { kind: 'today' },
      right: { kind: 'overdue' },
    });
  });

  it('parses NOT prefix', () => {
    expect(ast('!completed')).toEqual({
      kind: 'not',
      child: { kind: 'completed' },
    });
  });

  it('AND binds tighter than OR', () => {
    // a | b & c  parses as  a | (b & c)
    expect(ast('today | p1 & overdue')).toEqual({
      kind: 'or',
      left: { kind: 'today' },
      right: {
        kind: 'and',
        left: { kind: 'priority', value: 1 },
        right: { kind: 'overdue' },
      },
    });
  });

  it('NOT binds tighter than AND', () => {
    // !a & b  parses as  (!a) & b
    expect(ast('!today & p1')).toEqual({
      kind: 'and',
      left: { kind: 'not', child: { kind: 'today' } },
      right: { kind: 'priority', value: 1 },
    });
  });

  it('parses parenthesised groups', () => {
    // (a | b) & c — without parens this would parse as a | (b & c).
    expect(ast('(today | overdue) & p1')).toEqual({
      kind: 'and',
      left: {
        kind: 'or',
        left: { kind: 'today' },
        right: { kind: 'overdue' },
      },
      right: { kind: 'priority', value: 1 },
    });
  });

  it('parses double-negation', () => {
    expect(ast('!!today')).toEqual({
      kind: 'not',
      child: { kind: 'not', child: { kind: 'today' } },
    });
  });

  it('AND/OR are left-associative', () => {
    // a & b & c  parses as  (a & b) & c
    const result = ast('today & p1 & overdue');
    expect(result.kind).toBe('and');
    if (result.kind !== 'and') return;
    expect(result.right).toEqual({ kind: 'overdue' });
    expect(result.left.kind).toBe('and');
  });
});

describe('parse — architecture examples (§6.2)', () => {
  it('today & p1', () => {
    expect(ast('today & p1')).toEqual({
      kind: 'and',
      left: { kind: 'today' },
      right: { kind: 'priority', value: 1 },
    });
  });

  it('@work & overdue', () => {
    expect(ast('@work & overdue')).toEqual({
      kind: 'and',
      left: { kind: 'label', name: 'work' },
      right: { kind: 'overdue' },
    });
  });

  it('#personal & no-date', () => {
    expect(ast('#personal & no-date')).toEqual({
      kind: 'and',
      left: { kind: 'project', name: 'personal' },
      right: { kind: 'noDate' },
    });
  });
});

describe('parse — errors', () => {
  it('rejects empty input', () => {
    expect(() => parse([])).toThrow(FilterSyntaxError);
  });

  it('rejects unmatched (', () => {
    expect(() => ast('(today')).toThrow(FilterSyntaxError);
  });

  it('rejects unmatched )', () => {
    expect(() => ast('today)')).toThrow(FilterSyntaxError);
  });

  it('rejects missing operand after binary op', () => {
    expect(() => ast('today &')).toThrow(FilterSyntaxError);
  });

  it('rejects missing operand after !', () => {
    expect(() => ast('!')).toThrow(FilterSyntaxError);
  });

  it('rejects two atoms in a row (no operator)', () => {
    expect(() => ast('today p1')).toThrow(FilterSyntaxError);
  });
});

describe('mentionsCompletion', () => {
  it("returns false for filters that don't reference completion", () => {
    expect(mentionsCompletion(ast('today & p1'))).toBe(false);
    expect(mentionsCompletion(ast('@work | overdue'))).toBe(false);
  });

  it('returns true when completed appears anywhere in the tree', () => {
    expect(mentionsCompletion(ast('completed'))).toBe(true);
    expect(mentionsCompletion(ast('today & completed'))).toBe(true);
    expect(mentionsCompletion(ast('!completed'))).toBe(true);
    expect(mentionsCompletion(ast('(today & p1) | completed'))).toBe(true);
  });
});
