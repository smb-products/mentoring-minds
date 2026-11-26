'use server';
/**
 * server/taxonomy — Vienne's subjects and skills (math only today). Archive, never
 * delete: old ratings and notes keep pointing at the skill.
 * Contract: tests/contract/mock/server/taxonomy.js (the frozen mock)
 */
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin, requireUser } from '@/lib/guards';
import { action, found, need, query } from '@/lib/result';
import { grade, id, ids, parse, text } from '@/lib/validate';
import { STRANDS } from '@/lib/best';

const MATH = 'sub_math';
const strand = z.enum(STRANDS.map((s) => s.code) as [string, ...string[]], 'Choose a strand');

export const listSubjects = query(async (input: { includeArchived?: boolean } = {}) => {
  await requireUser();
  const { includeArchived } = parse(z.object({ includeArchived: z.boolean().optional() }), input);
  const subjects = await db.subject.findMany({
    where: includeArchived ? {} : { archivedAt: null },
    orderBy: { order: 'asc' },
    include: { skills: { where: includeArchived ? {} : { archivedAt: null }, orderBy: { order: 'asc' } } },
  });
  return subjects;
});

export const upsertSubject = action(async (input: { id?: string; name: string; color?: string }) => {
  await requireAdmin();
  const v = parse(z.object({ id: id.optional(), name: text(60).min(1, 'Name the subject'), color: z.string().max(30).optional() }), input);
  if (v.id) return db.subject.update({ where: { id: v.id }, data: { name: v.name, ...(v.color && { color: v.color }) } });
  const order = await db.subject.count();
  return db.subject.create({ data: { name: v.name, color: v.color || 'chart-1', order } });
});

const skillInput = z
  .object({
    id: id.optional(),
    subjectId: id.default(MATH),
    name: text(80).min(1, 'Name the skill'),
    strand: strand.optional(),
    gradeMin: grade,
    gradeMax: grade,
    benchmarkCodes: z.array(z.string().regex(/^MA\.(K|[1-8])\.[A-Z]{1,3}\.\d+\.\d+$/, 'That isn’t a B.E.S.T. benchmark code')).max(60).optional(),
  })
  .refine((v) => v.gradeMin <= v.gradeMax, 'Grade range is backwards');

export const upsertSkill = action(async (input: z.input<typeof skillInput>) => {
  await requireAdmin();
  const v = parse(skillInput, input);
  const fields = { name: v.name, gradeMin: v.gradeMin, gradeMax: v.gradeMax, ...(v.strand && { strand: v.strand }), ...(v.benchmarkCodes && { benchmarkCodes: v.benchmarkCodes }) };
  if (v.id) {
    found(await db.skill.findUnique({ where: { id: v.id } }), 'Skill');
    return db.skill.update({ where: { id: v.id }, data: fields });
  }
  found(await db.subject.findUnique({ where: { id: v.subjectId } }), 'Subject');
  const order = await db.skill.count({ where: { subjectId: v.subjectId } });
  return db.skill.create({ data: { subjectId: v.subjectId, strand: v.strand || 'NSO', benchmarkCodes: v.benchmarkCodes || [], order, ...fields } });
});

export const reorderSkills = action(async (input: { subjectId: string; skillIds: string[] }) => {
  await requireAdmin();
  const v = parse(z.object({ subjectId: id, skillIds: ids }), input);
  await db.$transaction(v.skillIds.map((skillId, i) => db.skill.updateMany({ where: { id: skillId, subjectId: v.subjectId }, data: { order: i } })));
  return null;
});

export const archiveSkill = action(async (input: { skillId: string; archived?: boolean }) => {
  await requireAdmin();
  const v = parse(z.object({ skillId: id, archived: z.boolean().default(true) }), input);
  const n = await db.skill.updateMany({ where: { id: v.skillId }, data: { archivedAt: v.archived ? new Date() : null } });
  need(n.count, 'Skill not found', 'NOT_FOUND');
  return null;
});

export const archiveSubject = action(async (input: { subjectId: string; archived?: boolean }) => {
  await requireAdmin();
  const v = parse(z.object({ subjectId: id, archived: z.boolean().default(true) }), input);
  const n = await db.subject.updateMany({ where: { id: v.subjectId }, data: { archivedAt: v.archived ? new Date() : null } });
  need(n.count, 'Subject not found', 'NOT_FOUND');
  return null;
});
