import { describe, it, expect } from 'vitest';
import {
  dayDiff,
  splitTodayScope,
  groupOverdue,
  pickDoFirst,
} from './selectors';
import type { TaskWithLabels } from '../../../../shared/schemas/tasks';

const TODAY = '2026-08-17';

function makeTask(
  overrides: Partial<TaskWithLabels> & { id: string },
): TaskWithLabels {
  return {
    projectId: null,
    sectionId: null,
    parentTaskId: null,
    title: overrides.id,
    description: '',
    dueDate: null,
    dueRecurrence: null,
    priority: 4,
    order: 0,
    completedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    deletedAt: null,
    triage: 0,
    sourceNoteId: null,
    labels: [],
    ...overrides,
  };
}

describe('dayDiff', () => {
  it('is 0 for today, negative for the past, positive for the future', () => {
    expect(dayDiff('2026-08-17', TODAY)).toBe(0);
    expect(dayDiff('2026-08-16', TODAY)).toBe(-1);
    expect(dayDiff('2026-08-20', TODAY)).toBe(3);
  });

  it('uses only the date part of a datetime due date', () => {
    expect(dayDiff('2026-08-16T23:30:00Z', TODAY)).toBe(-1);
  });

  it('crosses month boundaries correctly', () => {
    expect(dayDiff('2026-07-31', TODAY)).toBe(-17);
  });
});

describe('splitTodayScope', () => {
  it('separates overdue from due-today', () => {
    const tasks = [
      makeTask({ id: 'past', dueDate: '2026-08-10' }),
      makeTask({ id: 'today', dueDate: '2026-08-17' }),
      makeTask({ id: 'today-time', dueDate: '2026-08-17T09:00:00Z' }),
    ];
    const { overdue, today } = splitTodayScope(tasks, TODAY);
    expect(overdue.map((t) => t.id)).toEqual(['past']);
    expect(today.map((t) => t.id)).toEqual(['today', 'today-time']);
  });

  it('routes null due dates to today defensively', () => {
    const { overdue, today } = splitTodayScope(
      [makeTask({ id: 'none', dueDate: null })],
      TODAY,
    );
    expect(overdue).toHaveLength(0);
    expect(today).toHaveLength(1);
  });
});

describe('groupOverdue', () => {
  it('buckets by staleness and omits empty groups', () => {
    const groups = groupOverdue(
      [
        makeTask({ id: 'y', dueDate: '2026-08-16' }),
        makeTask({ id: 'w1', dueDate: '2026-08-12' }),
        makeTask({ id: 'w2', dueDate: '2026-08-10' }),
        makeTask({ id: 'old', dueDate: '2026-07-01' }),
      ],
      TODAY,
    );
    expect(groups.map((g) => g.label)).toEqual([
      'Yesterday',
      'This week',
      'Older',
    ]);
    // Least-stale first within a group.
    expect(groups[1]?.tasks.map((t) => t.id)).toEqual(['w1', 'w2']);
  });

  it('boundary: -7 days is This week, -8 is Older', () => {
    const groups = groupOverdue(
      [
        makeTask({ id: 'seven', dueDate: '2026-08-10' }),
        makeTask({ id: 'eight', dueDate: '2026-08-09' }),
      ],
      TODAY,
    );
    expect(
      groups.find((g) => g.label === 'This week')?.tasks.map((t) => t.id),
    ).toEqual(['seven']);
    expect(
      groups.find((g) => g.label === 'Older')?.tasks.map((t) => t.id),
    ).toEqual(['eight']);
  });

  it('ignores future and dateless tasks', () => {
    expect(
      groupOverdue(
        [
          makeTask({ id: 'future', dueDate: '2026-09-01' }),
          makeTask({ id: 'none', dueDate: null }),
        ],
        TODAY,
      ),
    ).toEqual([]);
  });
});

describe('pickDoFirst', () => {
  const prefs = { urgencyDays: 0, importanceCutoff: 2 as const };

  it('keeps only Q1 tasks, sorted by priority then due date, capped', () => {
    // classifyTask reads the real clock for urgency, so build dates
    // relative to now: yesterday is always urgent.
    const past = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const tasks = [
      makeTask({ id: 'p2', dueDate: past, priority: 2 }),
      makeTask({ id: 'p1', dueDate: past, priority: 1 }),
      makeTask({ id: 'unimportant', dueDate: past, priority: 3 }),
      makeTask({ id: 'not-urgent', dueDate: '2999-01-01', priority: 1 }),
      makeTask({ id: 'dateless', dueDate: null, priority: 1 }),
    ];
    const picked = pickDoFirst(tasks, prefs);
    expect(picked.map((t) => t.id)).toEqual(['p1', 'p2']);
  });

  it('caps the list', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const tasks = Array.from({ length: 8 }, (_, i) =>
      makeTask({ id: `t${i}`, dueDate: past, priority: 1 }),
    );
    expect(pickDoFirst(tasks, prefs, 5)).toHaveLength(5);
  });
});
