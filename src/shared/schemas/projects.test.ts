import { describe, expect, it } from 'vitest';
import {
  Project,
  ProjectArchiveInput,
  ProjectCreateInput,
  ProjectUpdateInput,
} from './projects';

const UUID = '01911e0a-7e6e-7d4a-9e2f-1234567890ab';
const ISO = '2026-05-19T10:00:00.000Z';

describe('ProjectCreateInput', () => {
  it('accepts a minimal name-only payload', () => {
    expect(ProjectCreateInput.parse({ name: 'Work' })).toEqual({ name: 'Work' });
  });

  it('rejects an empty name', () => {
    // Unlike notes/tasks where empty is "draft", a project must always
    // have a name (it's a navigation entry in the sidebar).
    expect(() => ProjectCreateInput.parse({ name: '' })).toThrow();
  });

  it('rejects name > 200 chars', () => {
    expect(() =>
      ProjectCreateInput.parse({ name: 'x'.repeat(201) }),
    ).toThrow();
  });

  it('accepts parentId nullable', () => {
    expect(
      ProjectCreateInput.parse({ name: 'sub', parentId: null }).parentId,
    ).toBeNull();
    expect(
      ProjectCreateInput.parse({ name: 'sub', parentId: UUID }).parentId,
    ).toBe(UUID);
  });

  it('accepts 6-digit hex color with or without #', () => {
    expect(() =>
      ProjectCreateInput.parse({ name: 'x', color: '#ff0066' }),
    ).not.toThrow();
    expect(() =>
      ProjectCreateInput.parse({ name: 'x', color: 'ff0066' }),
    ).not.toThrow();
  });

  it('rejects malformed color', () => {
    expect(() =>
      ProjectCreateInput.parse({ name: 'x', color: 'red' }),
    ).toThrow();
    expect(() =>
      ProjectCreateInput.parse({ name: 'x', color: '#fff' }),
    ).toThrow();
  });
});

describe('ProjectUpdateInput', () => {
  it('accepts a single-field patch', () => {
    expect(() =>
      ProjectUpdateInput.parse({ id: UUID, patch: { name: 'Renamed' } }),
    ).not.toThrow();
  });

  it('rejects archived_at in the patch (use the archive endpoint)', () => {
    expect(() =>
      ProjectUpdateInput.parse({
        id: UUID,
        patch: { archivedAt: ISO } as never,
      }),
    ).toThrow();
  });
});

describe('ProjectArchiveInput', () => {
  it('accepts {id, archived:true/false}', () => {
    expect(() =>
      ProjectArchiveInput.parse({ id: UUID, archived: true }),
    ).not.toThrow();
    expect(() =>
      ProjectArchiveInput.parse({ id: UUID, archived: false }),
    ).not.toThrow();
  });
});

describe('Project (canonical shape)', () => {
  it('round-trips a typical project', () => {
    const p = {
      id: UUID,
      name: 'Work',
      parentId: null,
      color: '#ff0000',
      order: 1,
      archivedAt: null,
      createdAt: ISO,
      updatedAt: ISO,
    };
    expect(Project.parse(p)).toEqual(p);
  });
});
