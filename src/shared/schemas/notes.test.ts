import { describe, expect, it } from 'vitest';
import {
  Note,
  NoteCreateInput,
  NoteDeleteInput,
  NoteGetInput,
  NoteListInput,
  NoteUpdateInput,
} from './notes';

const VALID_UUID = '01911e0a-7e6e-7d4a-9e2f-1234567890ab'; // v7-shaped
const VALID_ISO = '2026-05-19T10:00:00.000Z';

describe('NoteCreateInput', () => {
  it('accepts minimal valid input', () => {
    expect(NoteCreateInput.parse({ title: 'Hello' })).toEqual({ title: 'Hello' });
  });

  it('accepts all optional fields', () => {
    const input = { title: 'Hello', body: 'world', folderId: VALID_UUID };
    expect(NoteCreateInput.parse(input)).toEqual(input);
  });

  it('accepts null folderId', () => {
    expect(NoteCreateInput.parse({ title: 'x', folderId: null }).folderId).toBeNull();
  });

  it('rejects empty title', () => {
    expect(() => NoteCreateInput.parse({ title: '' })).toThrow();
  });

  it('rejects title > 500 chars', () => {
    expect(() => NoteCreateInput.parse({ title: 'a'.repeat(501) })).toThrow();
  });

  it('rejects body > 1MB', () => {
    expect(() =>
      NoteCreateInput.parse({ title: 'x', body: 'b'.repeat(1_000_001) }),
    ).toThrow();
  });

  it('rejects malformed folderId', () => {
    expect(() =>
      NoteCreateInput.parse({ title: 'x', folderId: 'not-a-uuid' }),
    ).toThrow();
  });
});

describe('NoteUpdateInput', () => {
  it('accepts a single-field patch', () => {
    const parsed = NoteUpdateInput.parse({
      id: VALID_UUID,
      patch: { title: 'New title' },
    });
    expect(parsed.patch).toEqual({ title: 'New title' });
  });

  it('accepts an empty patch (touch)', () => {
    expect(() => NoteUpdateInput.parse({ id: VALID_UUID, patch: {} })).not.toThrow();
  });

  it('rejects unknown patch fields (strict)', () => {
    // Defence against the renderer accidentally trying to write fields the
    // service doesn't expect — e.g. id, deletedAt — via the update channel.
    expect(() =>
      NoteUpdateInput.parse({
        id: VALID_UUID,
        patch: { id: VALID_UUID } as never,
      }),
    ).toThrow();
    expect(() =>
      NoteUpdateInput.parse({
        id: VALID_UUID,
        patch: { deletedAt: VALID_ISO } as never,
      }),
    ).toThrow();
  });

  it('rejects when id is missing', () => {
    expect(() => NoteUpdateInput.parse({ patch: { title: 'x' } } as never)).toThrow();
  });
});

describe('NoteListInput', () => {
  it('accepts empty input', () => {
    expect(NoteListInput.parse({})).toEqual({});
  });

  it('accepts includeDeleted, folderId=null, limit', () => {
    const parsed = NoteListInput.parse({
      includeDeleted: true,
      folderId: null,
      limit: 50,
    });
    expect(parsed).toEqual({ includeDeleted: true, folderId: null, limit: 50 });
  });

  it('rejects limit < 1', () => {
    expect(() => NoteListInput.parse({ limit: 0 })).toThrow();
  });

  it('rejects limit > 1000', () => {
    expect(() => NoteListInput.parse({ limit: 1001 })).toThrow();
  });

  it('rejects non-integer limit', () => {
    expect(() => NoteListInput.parse({ limit: 1.5 })).toThrow();
  });
});

describe('NoteGetInput / NoteDeleteInput', () => {
  it('NoteGetInput requires a valid uuid', () => {
    expect(NoteGetInput.parse({ id: VALID_UUID }).id).toBe(VALID_UUID);
    expect(() => NoteGetInput.parse({ id: 'nope' })).toThrow();
  });

  it('NoteDeleteInput requires a valid uuid', () => {
    expect(NoteDeleteInput.parse({ id: VALID_UUID }).id).toBe(VALID_UUID);
    expect(() => NoteDeleteInput.parse({ id: '' })).toThrow();
  });
});

describe('Note (canonical shape)', () => {
  it('accepts a fully-populated note', () => {
    const note = {
      id: VALID_UUID,
      title: 'Hello',
      body: 'world',
      folderId: null,
      createdAt: VALID_ISO,
      updatedAt: VALID_ISO,
      deletedAt: null,
    };
    expect(Note.parse(note)).toEqual(note);
  });

  it('rejects a note with malformed timestamps', () => {
    const bad = {
      id: VALID_UUID,
      title: 'x',
      body: '',
      folderId: null,
      createdAt: 'not a date',
      updatedAt: VALID_ISO,
      deletedAt: null,
    };
    expect(() => Note.parse(bad)).toThrow();
  });
});
