import type { FilterAst, SqlFragment } from './types';

/**
 * Compile a filter AST to a parameterised SQL WHERE fragment.
 *
 * The fragment is meant to be ANDed with the service's base WHERE
 * conditions (deleted_at IS NULL, and conditionally completed_at IS NULL).
 * The outer SELECT is FROM tasks — column references in the fragment
 * resolve against the tasks table.
 *
 * Parameters use `?` placeholders bound positionally; the SQL string
 * NEVER includes user-controlled substrings.
 *
 * Date semantics
 *   today / overdue / upcoming / tomorrow all compute their date
 *   strings against `ctx.now` (defaults to new Date()). Dates are
 *   produced in YYYY-MM-DD form in LOCAL time — the user's "today",
 *   not UTC's.
 */

export interface CompileContext {
  /** Reference moment for relative date keywords. Defaults to `new Date()`. */
  readonly now?: Date;
}

export function compile(
  ast: FilterAst,
  ctx: CompileContext = {},
): SqlFragment {
  const builder = new Builder(ctx.now ?? new Date());
  builder.visit(ast);
  return { sql: builder.sql, params: builder.params };
}

class Builder {
  sql = '';
  readonly params: unknown[] = [];

  private readonly today: string;
  private readonly tomorrow: string;
  private readonly dayAfter: string;

  constructor(now: Date) {
    this.today = localDateString(now);
    this.tomorrow = localDateString(addDays(now, 1));
    this.dayAfter = localDateString(addDays(now, 2));
  }

  visit(ast: FilterAst): void {
    switch (ast.kind) {
      case 'and':
        this.sql += '(';
        this.visit(ast.left);
        this.sql += ' AND ';
        this.visit(ast.right);
        this.sql += ')';
        return;
      case 'or':
        this.sql += '(';
        this.visit(ast.left);
        this.sql += ' OR ';
        this.visit(ast.right);
        this.sql += ')';
        return;
      case 'not':
        this.sql += 'NOT (';
        this.visit(ast.child);
        this.sql += ')';
        return;

      // ── Date predicates ────────────────────────────────────────────────
      // dueBefore semantics are strict (`<`) to handle date-only vs
      // datetime values stored side-by-side (see services/tasks.ts).
      case 'today':
        // Everything due on or before today: due_date < tomorrow.
        this.sql += 'due_date < ?';
        this.params.push(this.tomorrow);
        return;
      case 'tomorrow':
        // Half-open [tomorrow, day-after).
        this.sql += '(due_date >= ? AND due_date < ?)';
        this.params.push(this.tomorrow, this.dayAfter);
        return;
      case 'overdue':
        // Strictly before today. `completed_at IS NULL` is added by the
        // service unless the filter mentions `completed`, so we don't
        // include it here.
        this.sql += 'due_date < ?';
        this.params.push(this.today);
        return;
      case 'upcoming':
        // Tomorrow or later — no upper bound.
        this.sql += 'due_date >= ?';
        this.params.push(this.tomorrow);
        return;
      case 'noDate':
        this.sql += 'due_date IS NULL';
        return;

      // ── Status predicates ─────────────────────────────────────────────
      case 'completed':
        this.sql += 'completed_at IS NOT NULL';
        return;
      case 'inbox':
        this.sql += 'project_id IS NULL';
        return;

      // ── Priority ──────────────────────────────────────────────────────
      case 'priority':
        this.sql += 'priority = ?';
        this.params.push(ast.value);
        return;

      // ── Project / label lookups by NAME, not id ───────────────────────
      // Subquery so the filter survives a project/label rename later
      // (we re-resolve at exec time). Names are matched case-insensitive.
      case 'project':
        this.sql +=
          'project_id IN (SELECT id FROM projects WHERE lower(name) = ?)';
        this.params.push(ast.name.toLowerCase());
        return;
      case 'label':
        this.sql +=
          'EXISTS (SELECT 1 FROM task_labels tl ' +
          'JOIN labels l ON l.id = tl.label_id ' +
          'WHERE tl.task_id = tasks.id AND lower(l.name) = ?)';
        this.params.push(ast.name.toLowerCase());
        return;
    }
  }
}

// ── Local-date helpers (duplicated from renderer/src/lib/dates because the
//    shared/ tree must not import from renderer/). Keep semantics in sync.

function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}
