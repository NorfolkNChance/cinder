import { describe, expect, it } from 'vitest';
import {
  Section,
  SectionCreateInput,
  SectionListInput,
  SectionUpdateInput,
} from './sections';

const UUID = '01911e0a-7e6e-7d4a-9e2f-1234567890ab';
const ISO = '2026-05-19T10:00:00.000Z';

describe('SectionCreateInput', () => {
  it('accepts projectId + name', () => {
    expect(
      SectionCreateInput.parse({ projectId: UUID, name: 'Backlog' }),
    ).toEqual({ projectId: UUID, name: 'Backlog' });
  });

  it('rejects empty name', () => {
    expect(() =>
      SectionCreateInput.parse({ projectId: UUID, name: '' }),
    ).toThrow();
  });

  it('rejects missing projectId', () => {
    expect(() =>
      SectionCreateInput.parse({ name: 'Backlog' } as never),
    ).toThrow();
  });
});

describe('SectionListInput', () => {
  it('requires projectId', () => {
    expect(() => SectionListInput.parse({} as never)).toThrow();
    expect(SectionListInput.parse({ projectId: UUID }).projectId).toBe(UUID);
  });
});

describe('SectionUpdateInput', () => {
  it('rejects project_id in the patch (sections are pinned to a project)', () => {
    expect(() =>
      SectionUpdateInput.parse({
        id: UUID,
        patch: { projectId: UUID } as never,
      }),
    ).toThrow();
  });
});

describe('Section (canonical shape)', () => {
  it('round-trips a typical section', () => {
    const s = {
      id: UUID,
      projectId: UUID,
      name: 'Backlog',
      order: 1,
      createdAt: ISO,
      updatedAt: ISO,
    };
    expect(Section.parse(s)).toEqual(s);
  });
});
