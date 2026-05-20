import { describe, expect, it } from 'vitest';
import { lex } from './lex';
import { FilterSyntaxError } from './types';

function kinds(input: string): string[] {
  return [...lex(input)].map((t) => t.kind);
}

describe('lex — atoms', () => {
  it('lexes each keyword', () => {
    for (const kw of [
      'today',
      'tomorrow',
      'overdue',
      'upcoming',
      'no-date',
      'completed',
      'inbox',
    ]) {
      const tokens = lex(kw);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({ kind: 'keyword', value: kw });
    }
  });

  it('keywords are case-insensitive', () => {
    expect(lex('TODAY')[0]).toMatchObject({ kind: 'keyword', value: 'today' });
    expect(lex('No-Date')[0]).toMatchObject({
      kind: 'keyword',
      value: 'no-date',
    });
  });

  it('lexes priorities p1-p4 (and upper)', () => {
    for (const i of [1, 2, 3, 4] as const) {
      const tokens = lex(`p${i}`);
      expect(tokens[0]).toMatchObject({ kind: 'priority', value: i });
      expect(lex(`P${i}`)[0]).toMatchObject({ kind: 'priority', value: i });
    }
  });

  it('lexes #project tags', () => {
    expect(lex('#work')[0]).toMatchObject({ kind: 'project', name: 'work' });
    expect(lex('#side-project')[0]).toMatchObject({
      kind: 'project',
      name: 'side-project',
    });
  });

  it('lexes @label tags', () => {
    expect(lex('@urgent')[0]).toMatchObject({ kind: 'label', name: 'urgent' });
    expect(lex('@to-review')[0]).toMatchObject({
      kind: 'label',
      name: 'to-review',
    });
  });
});

describe('lex — operators', () => {
  it('lexes &, |, !, parens', () => {
    expect(kinds('today & overdue')).toEqual(['keyword', 'and', 'keyword']);
    expect(kinds('today | tomorrow')).toEqual(['keyword', 'or', 'keyword']);
    expect(kinds('!completed')).toEqual(['not', 'keyword']);
    expect(kinds('(today)')).toEqual(['lparen', 'keyword', 'rparen']);
  });

  it('skips whitespace between tokens', () => {
    expect(kinds(' \t today  &\n  p1\t ')).toEqual([
      'keyword',
      'and',
      'priority',
    ]);
  });
});

describe('lex — errors', () => {
  it('rejects unknown bare words', () => {
    expect(() => lex('garbage')).toThrow(FilterSyntaxError);
  });

  it('rejects priority outside 1-4', () => {
    expect(() => lex('p5')).toThrow(FilterSyntaxError);
    expect(() => lex('p0')).toThrow(FilterSyntaxError);
  });

  it('rejects empty #', () => {
    expect(() => lex('#')).toThrow(FilterSyntaxError);
  });

  it('rejects empty @', () => {
    expect(() => lex('@')).toThrow(FilterSyntaxError);
  });

  it('rejects unexpected characters', () => {
    expect(() => lex('today + p1')).toThrow(FilterSyntaxError);
    expect(() => lex('today $')).toThrow(FilterSyntaxError);
  });

  it('FilterSyntaxError carries the offending position', () => {
    try {
      lex('today & garbage');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(FilterSyntaxError);
      expect((e as FilterSyntaxError).pos).toBe(8); // 'g' of garbage
    }
  });
});

describe('lex — positions', () => {
  it('records start position of each token', () => {
    const tokens = lex('today & p1');
    expect(tokens[0]?.pos).toBe(0);
    expect(tokens[1]?.pos).toBe(6);
    expect(tokens[2]?.pos).toBe(8);
  });
});
