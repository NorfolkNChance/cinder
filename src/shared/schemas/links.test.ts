import { describe, expect, it } from 'vitest';
import {
  LinkCreateInput,
  LinkDeleteInput,
  LinkListForNoteInput,
  LinkListForTaskInput,
} from './links';

const NOTE = '01911e0a-7e6e-7d4a-9e2f-1234567890ab';
const TASK = '01911e0a-7e6e-7d4a-9e2f-aabbccddeeff';

describe('LinkCreateInput', () => {
  it('accepts a valid note/task pair', () => {
    expect(LinkCreateInput.parse({ noteId: NOTE, taskId: TASK })).toEqual({
      noteId: NOTE,
      taskId: TASK,
    });
  });

  it('rejects a missing taskId', () => {
    expect(() => LinkCreateInput.parse({ noteId: NOTE } as never)).toThrow();
  });

  it('rejects a non-UUID id', () => {
    expect(() =>
      LinkCreateInput.parse({ noteId: 'not-a-uuid', taskId: TASK }),
    ).toThrow();
  });

  it('strips unknown keys to the declared shape', () => {
    // Zod object (non-strict) drops extras — the handler only ever sees
    // the two ids it expects.
    expect(
      LinkCreateInput.parse({ noteId: NOTE, taskId: TASK, evil: 1 } as never),
    ).toEqual({ noteId: NOTE, taskId: TASK });
  });
});

describe('LinkDeleteInput', () => {
  it('accepts a valid note/task pair', () => {
    expect(LinkDeleteInput.parse({ noteId: NOTE, taskId: TASK })).toEqual({
      noteId: NOTE,
      taskId: TASK,
    });
  });

  it('rejects a missing noteId', () => {
    expect(() => LinkDeleteInput.parse({ taskId: TASK } as never)).toThrow();
  });
});

describe('LinkListForNoteInput', () => {
  it('requires a noteId', () => {
    expect(() => LinkListForNoteInput.parse({} as never)).toThrow();
    expect(LinkListForNoteInput.parse({ noteId: NOTE }).noteId).toBe(NOTE);
  });
});

describe('LinkListForTaskInput', () => {
  it('requires a taskId', () => {
    expect(() => LinkListForTaskInput.parse({} as never)).toThrow();
    expect(LinkListForTaskInput.parse({ taskId: TASK }).taskId).toBe(TASK);
  });
});
