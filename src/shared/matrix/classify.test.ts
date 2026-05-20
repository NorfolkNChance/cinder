import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { classifyTask, classifyAll, DEFAULT_MATRIX_PREFS } from './classify';

/**
 * Pin "today" so tests are date-stable.
 * We pick 2026-05-20 to match the current date in context.
 */
const TODAY = '2026-05-20';

function makeTask(
  overrides: Partial<{ dueDate: string | null; priority: number }>,
): { id: string; dueDate: string | null; priority: number } {
  return {
    id: 'test-id',
    dueDate: null,
    priority: 3,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('classifyTask', () => {
  it('Q1 Do — urgent + important', () => {
    expect(
      classifyTask(makeTask({ dueDate: TODAY, priority: 1 })),
    ).toBe('do');
  });

  it('Q1 Do — overdue + important', () => {
    expect(
      classifyTask(makeTask({ dueDate: '2026-05-18', priority: 2 })),
    ).toBe('do');
  });

  it('Q2 Schedule — not urgent + important', () => {
    expect(
      classifyTask(makeTask({ dueDate: '2026-05-25', priority: 1 })),
    ).toBe('schedule');
  });

  it('Q2 Schedule — no due date + important', () => {
    expect(
      classifyTask(makeTask({ dueDate: null, priority: 2 })),
    ).toBe('schedule');
  });

  it('Q3 Delegate — urgent + not important', () => {
    expect(
      classifyTask(makeTask({ dueDate: TODAY, priority: 3 })),
    ).toBe('delegate');
  });

  it('Q4 Eliminate — not urgent + not important', () => {
    expect(
      classifyTask(makeTask({ dueDate: '2026-06-01', priority: 4 })),
    ).toBe('eliminate');
  });

  it('Q4 Eliminate — no due date + not important', () => {
    expect(
      classifyTask(makeTask({ dueDate: null, priority: 4 })),
    ).toBe('eliminate');
  });

  describe('urgencyDays threshold', () => {
    it('task due in 3 days is urgent when urgencyDays=3', () => {
      expect(
        classifyTask(
          makeTask({ dueDate: '2026-05-23', priority: 1 }),
          { urgencyDays: 3, importanceCutoff: 2 },
        ),
      ).toBe('do');
    });

    it('task due in 4 days is NOT urgent when urgencyDays=3', () => {
      expect(
        classifyTask(
          makeTask({ dueDate: '2026-05-24', priority: 1 }),
          { urgencyDays: 3, importanceCutoff: 2 },
        ),
      ).toBe('schedule');
    });
  });

  describe('importanceCutoff threshold', () => {
    it('P3 is important when cutoff=3', () => {
      expect(
        classifyTask(
          makeTask({ dueDate: null, priority: 3 }),
          { urgencyDays: 0, importanceCutoff: 3 },
        ),
      ).toBe('schedule');
    });

    it('P3 is not important when cutoff=2 (default)', () => {
      expect(
        classifyTask(
          makeTask({ dueDate: null, priority: 3 }),
          DEFAULT_MATRIX_PREFS,
        ),
      ).toBe('eliminate');
    });
  });
});

describe('classifyAll', () => {
  it('partitions tasks into four buckets', () => {
    const tasks = [
      makeTask({ dueDate: TODAY, priority: 1 }),       // do
      makeTask({ dueDate: '2026-06-01', priority: 1 }), // schedule
      makeTask({ dueDate: TODAY, priority: 4 }),        // delegate
      makeTask({ dueDate: null, priority: 4 }),         // eliminate
    ];
    const result = classifyAll(tasks);
    expect(result.do).toHaveLength(1);
    expect(result.schedule).toHaveLength(1);
    expect(result.delegate).toHaveLength(1);
    expect(result.eliminate).toHaveLength(1);
  });

  it('preserves input order within each bucket', () => {
    const a = { ...makeTask({ dueDate: TODAY, priority: 1 }), id: 'a' };
    const b = { ...makeTask({ dueDate: TODAY, priority: 1 }), id: 'b' };
    const c = { ...makeTask({ dueDate: TODAY, priority: 1 }), id: 'c' };
    expect(classifyAll([a, b, c]).do.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});
