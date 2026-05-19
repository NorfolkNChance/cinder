import { v7 as uuidv7 } from 'uuid';
import { asc, eq, sql } from 'drizzle-orm';
import { getDrizzle } from '../db/drizzle';
import { sections } from '../db/schema';
import type {
  Section,
  SectionCreateInput,
  SectionListInput,
  SectionUpdateInput,
} from '../../shared/schemas/sections';

/**
 * Sections service. See projects.ts for the shared conventions; sections
 * are simpler — no archive, no parent, just a project_id, name, and
 * order within their project.
 */

function nowIso(): string {
  return new Date().toISOString();
}

async function getById(id: string): Promise<Section | null> {
  const db = getDrizzle();
  const rows = await db
    .select()
    .from(sections)
    .where(eq(sections.id, id))
    .limit(1);
  return (rows[0] as Section | undefined) ?? null;
}

async function nextOrderInProject(projectId: string): Promise<number> {
  const db = getDrizzle();
  const rows = await db
    .select({ max: sql<number>`COALESCE(MAX(${sections.order}), 0)` })
    .from(sections)
    .where(eq(sections.projectId, projectId));
  const current = rows[0]?.max ?? 0;
  return current + 1;
}

export const sectionsService = {
  async create(input: SectionCreateInput): Promise<Section> {
    const db = getDrizzle();
    const now = nowIso();
    const row: Section = {
      id: uuidv7(),
      projectId: input.projectId,
      name: input.name,
      order: await nextOrderInProject(input.projectId),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(sections).values(row);
    return row;
  },

  get(id: string): Promise<Section | null> {
    return getById(id);
  },

  async list(input: SectionListInput): Promise<readonly Section[]> {
    const db = getDrizzle();
    const rows = await db
      .select()
      .from(sections)
      .where(eq(sections.projectId, input.projectId))
      .orderBy(asc(sections.order));
    return rows as Section[];
  },

  async update(input: SectionUpdateInput): Promise<Section | null> {
    const db = getDrizzle();
    const patch = { ...input.patch, updatedAt: nowIso() };
    await db.update(sections).set(patch).where(eq(sections.id, input.id));
    return getById(input.id);
  },

  async delete(id: string): Promise<void> {
    // Hard delete. Tasks in this section have section_id SET NULL via FK
    // (they survive in the project, just at the project's top level).
    const db = getDrizzle();
    await db.delete(sections).where(eq(sections.id, id));
  },
} as const;
