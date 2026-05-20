import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from './compile';
import { lex } from './lex';
import { parse } from './parse';
import { filterToSql } from './index';
import type { FilterAst } from './types';

const FIXED_NOW = new Date(2026, 4, 19, 10, 0, 0); // Tue 2026-05-19 local

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function compileStr(input: string) {
  const tokens = lex(input);
  const ast = parse(tokens);
  return compile(ast, { now: FIXED_NOW });
}

describe('compile — atoms', () => {
  it('today → due_date < tomorrow', () => {
    const r = compileStr('today');
    expect(r.sql).toBe('due_date < ?');
    expect(r.params).toEqual(['2026-05-20']);
  });

  it('tomorrow → half-open window [tomorrow, day-after)', () => {
    const r = compileStr('tomorrow');
    expect(r.sql).toBe('(due_date >= ? AND due_date < ?)');
    expect(r.params).toEqual(['2026-05-20', '2026-05-21']);
  });

  it('overdue → due_date < today (no completion clause; service adds default)', () => {
    const r = compileStr('overdue');
    expect(r.sql).toBe('due_date < ?');
    expect(r.params).toEqual(['2026-05-19']);
  });

  it('upcoming → due_date >= tomorrow', () => {
    const r = compileStr('upcoming');
    expect(r.sql).toBe('due_date >= ?');
    expect(r.params).toEqual(['2026-05-20']);
  });

  it('no-date → IS NULL (no params)', () => {
    const r = compileStr('no-date');
    expect(r.sql).toBe('due_date IS NULL');
    expect(r.params).toEqual([]);
  });

  it('completed → completed_at IS NOT NULL', () => {
    const r = compileStr('completed');
    expect(r.sql).toBe('completed_at IS NOT NULL');
    expect(r.params).toEqual([]);
  });

  it('inbox → project_id IS NULL', () => {
    const r = compileStr('inbox');
    expect(r.sql).toBe('project_id IS NULL');
    expect(r.params).toEqual([]);
  });

  it('priority → priority = N with parameter', () => {
    const r = compileStr('p1');
    expect(r.sql).toBe('priority = ?');
    expect(r.params).toEqual([1]);
  });

  it('#project → name lookup subquery, lowercased', () => {
    const r = compileStr('#Work');
    expect(r.sql).toBe(
      'project_id IN (SELECT id FROM projects WHERE lower(name) = ?)',
    );
    expect(r.params).toEqual(['work']);
  });

  it('@label → EXISTS subquery with case-insensitive name match', () => {
    const r = compileStr('@Urgent');
    expect(r.sql).toBe(
      'EXISTS (SELECT 1 FROM task_labels tl JOIN labels l ON l.id = tl.label_id WHERE tl.task_id = tasks.id AND lower(l.name) = ?)',
    );
    expect(r.params).toEqual(['urgent']);
  });
});

describe('compile — combinators', () => {
  it('AND wraps both sides in parens', () => {
    const r = compileStr('today & p1');
    expect(r.sql).toBe('(due_date < ? AND priority = ?)');
    expect(r.params).toEqual(['2026-05-20', 1]);
  });

  it('OR wraps both sides in parens', () => {
    const r = compileStr('today | overdue');
    expect(r.sql).toBe('(due_date < ? OR due_date < ?)');
    expect(r.params).toEqual(['2026-05-20', '2026-05-19']);
  });

  it('NOT wraps child in parens', () => {
    const r = compileStr('!completed');
    expect(r.sql).toBe('NOT (completed_at IS NOT NULL)');
    expect(r.params).toEqual([]);
  });

  it('precedence: a | b & c → a OR (b AND c)', () => {
    const r = compileStr('today | p1 & overdue');
    expect(r.sql).toBe(
      '(due_date < ? OR (priority = ? AND due_date < ?))',
    );
    expect(r.params).toEqual(['2026-05-20', 1, '2026-05-19']);
  });

  it('explicit parens override precedence', () => {
    const r = compileStr('(today | p1) & overdue');
    expect(r.sql).toBe(
      '((due_date < ? OR priority = ?) AND due_date < ?)',
    );
    expect(r.params).toEqual(['2026-05-20', 1, '2026-05-19']);
  });
});

describe('compile — architecture examples (§6.2)', () => {
  it('today & p1', () => {
    const r = compileStr('today & p1');
    expect(r.sql).toContain('due_date < ?');
    expect(r.sql).toContain('priority = ?');
    expect(r.params).toEqual(['2026-05-20', 1]);
  });

  it('@work & overdue', () => {
    const r = compileStr('@work & overdue');
    expect(r.sql).toContain('EXISTS');
    expect(r.sql).toContain('lower(l.name) = ?');
    expect(r.sql).toContain('due_date < ?');
    expect(r.params).toEqual(['work', '2026-05-19']);
  });

  it('#personal & no-date', () => {
    const r = compileStr('#personal & no-date');
    expect(r.sql).toContain('lower(name) = ?');
    expect(r.sql).toContain('due_date IS NULL');
    expect(r.params).toEqual(['personal']);
  });
});

describe('filterToSql (convenience)', () => {
  it('returns the SQL fragment, the AST, and the completion flag', () => {
    const r = filterToSql('today & p1', { now: FIXED_NOW });
    expect(r.fragment.sql).toBe('(due_date < ? AND priority = ?)');
    expect(r.mentionsCompleted).toBe(false);
    expect(r.ast).toEqual({
      kind: 'and',
      left: { kind: 'today' },
      right: { kind: 'priority', value: 1 },
    });
  });

  it('mentionsCompleted is true when `completed` appears anywhere', () => {
    expect(filterToSql('completed', { now: FIXED_NOW }).mentionsCompleted).toBe(
      true,
    );
    expect(
      filterToSql('!completed & today', { now: FIXED_NOW }).mentionsCompleted,
    ).toBe(true);
  });
});

describe('compile — no user input ever lands in the SQL string', () => {
  it('project name with SQL meta-chars is bound as a parameter, not interpolated', () => {
    // The lexer rejects the input first (semicolon isn't a tag char),
    // but as a safety check: any name allowed by the lexer ends up as
    // a bound parameter, not in the sql string.
    const ast: FilterAst = { kind: 'project', name: "evil'; DROP TABLE--" };
    const r = compile(ast);
    expect(r.sql).not.toContain('evil');
    expect(r.sql).not.toContain('DROP');
    expect(r.params).toEqual([`evil'; drop table--`]);
  });
});
