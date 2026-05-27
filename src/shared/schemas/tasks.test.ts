import { describe, expect, it } from 'vitest';
import {
  Task,
  TaskCompleteInput,
  TaskCreateInput,
  TaskListInput,
  TaskUpdateInput,
} from './tasks';

const UUID = '01911e0a-7e6e-7d4a-9e2f-1234567890ab';
const ISO = '2026-05-19T10:00:00.000Z';

describe('TaskCreateInput', () => {
  it('accepts the minimum (just a title)', () => {
    expect(TaskCreateInput.parse({ title: 'buy milk' })).toEqual({
      title: 'buy milk',
    });
  });

  it('accepts an empty title (draft state)', () => {
    expect(() => TaskCreateInput.parse({ title: '' })).not.toThrow();
  });

  it('accepts a full payload', () => {
    const input = {
      title: 'ship it',
      description: 'the release notes are in the PR',
      projectId: UUID,
      sectionId: UUID,
      parentTaskId: null,
      dueDate: '2026-05-20',
      priority: 1,
    };
    expect(TaskCreateInput.parse(input)).toEqual(input);
  });

  it('rejects priority outside 1-4', () => {
    expect(() =>
      TaskCreateInput.parse({ title: 'x', priority: 0 }),
    ).toThrow();
    expect(() =>
      TaskCreateInput.parse({ title: 'x', priority: 5 }),
    ).toThrow();
  });

  it('rejects non-integer priority', () => {
    expect(() =>
      TaskCreateInput.parse({ title: 'x', priority: 1.5 }),
    ).toThrow();
  });

  it('accepts a date-only dueDate', () => {
    expect(() =>
      TaskCreateInput.parse({ title: 'x', dueDate: '2026-05-20' }),
    ).not.toThrow();
  });

  it('accepts a full ISO datetime dueDate', () => {
    expect(() =>
      TaskCreateInput.parse({ title: 'x', dueDate: '2026-05-20T15:00:00Z' }),
    ).not.toThrow();
  });

  it('rejects a malformed dueDate', () => {
    expect(() =>
      TaskCreateInput.parse({ title: 'x', dueDate: 'tomorrow' }),
    ).toThrow();
  });

  it('rejects oversized title', () => {
    expect(() =>
      TaskCreateInput.parse({ title: 'a'.repeat(501) }),
    ).toThrow();
  });
});

describe('TaskListInput', () => {
  it('accepts the empty filter (all active tasks)', () => {
    expect(TaskListInput.parse({})).toEqual({});
  });

  it('accepts projectId:null as the Inbox predicate', () => {
    expect(TaskListInput.parse({ projectId: null }).projectId).toBeNull();
  });

  it('accepts the Today window pair', () => {
    const today = '2026-05-19';
    const tomorrow = '2026-05-20';
    const parsed = TaskListInput.parse({
      dueOnOrAfter: today,
      dueBefore: tomorrow,
    });
    expect(parsed.dueOnOrAfter).toBe(today);
    expect(parsed.dueBefore).toBe(tomorrow);
  });

  it('rejects limit outside [1,1000]', () => {
    expect(() => TaskListInput.parse({ limit: 0 })).toThrow();
    expect(() => TaskListInput.parse({ limit: 1001 })).toThrow();
  });
});

describe('TaskUpdateInput', () => {
  it('accepts a single-field patch', () => {
    expect(() =>
      TaskUpdateInput.parse({ id: UUID, patch: { priority: 1 } }),
    ).not.toThrow();
  });

  it('accepts an empty patch (touch)', () => {
    expect(() => TaskUpdateInput.parse({ id: UUID, patch: {} })).not.toThrow();
  });

  it('rejects unknown patch fields (strict)', () => {
    // completed_at, id, timestamps, deleted_at must NEVER be written via
    // the update channel — they have their own endpoints (complete/delete).
    expect(() =>
      TaskUpdateInput.parse({
        id: UUID,
        patch: { completedAt: ISO } as never,
      }),
    ).toThrow();
    expect(() =>
      TaskUpdateInput.parse({
        id: UUID,
        patch: { deletedAt: ISO } as never,
      }),
    ).toThrow();
    expect(() =>
      TaskUpdateInput.parse({
        id: UUID,
        patch: { id: UUID } as never,
      }),
    ).toThrow();
  });

  it('rejects invalid priority in patch', () => {
    expect(() =>
      TaskUpdateInput.parse({ id: UUID, patch: { priority: 9 } }),
    ).toThrow();
  });
});

describe('TaskCompleteInput', () => {
  it('accepts {id, completed:true}', () => {
    expect(() =>
      TaskCompleteInput.parse({ id: UUID, completed: true }),
    ).not.toThrow();
  });

  it('accepts {id, completed:false} for reopening', () => {
    expect(() =>
      TaskCompleteInput.parse({ id: UUID, completed: false }),
    ).not.toThrow();
  });

  it('rejects missing completed', () => {
    expect(() => TaskCompleteInput.parse({ id: UUID } as never)).toThrow();
  });
});

describe('Task (canonical shape)', () => {
  it('accepts a fully-populated task', () => {
    const task = {
      id: UUID,
      projectId: null,
      sectionId: null,
      parentTaskId: null,
      title: 'buy milk',
      description: '',
      dueDate: null,
      dueRecurrence: null,
      priority: 4,
      order: 0,
      completedAt: null,
      createdAt: ISO,
      updatedAt: ISO,
      deletedAt: null,
      triage: 0,
      sourceNoteId: null,
    };
    expect(Task.parse(task)).toEqual(task);
  });
});
