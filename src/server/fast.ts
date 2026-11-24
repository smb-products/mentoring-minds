'use server';
/**
 * server/fast — FAST (grades 3–6) and Star Math (K–2) results, and the testing
 * windows. Vienne or the student's parent can enter a result; every row records
 * who entered it, and only Vienne can change one someone else entered.
 * Contract: src/mock/server/fast.js
 */
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireStudentAccess, requireUser } from '@/lib/guards';
import { action, found, need, query } from '@/lib/result';
import { id, parse } from '@/lib/validate';
import { AREA_LABEL, categoriesFor, isFastGrade } from '@/lib/best';
import { loadSettings, nextFastWindow } from '@/lib/settings';

type Category = { categoryId: string; level: number };

const resultDTO = (r: { gradeTested: number; categories: unknown; enteredBy?: { id: string; name: string; role: string } | null } & Record<string, unknown>) => {
  const cats = categoriesFor(r.gradeTested);
  return {
    ...r,
    enteredBy: r.enteredBy ?? null,
    categories: ((r.categories as Category[]) ?? []).map((c) => {
      const cat = cats.find((x) => x.id === c.categoryId);
      return { ...c, name: cat ? AREA_LABEL[cat.short] : c.categoryId, fullName: cat?.name };
    }),
  };
};
const enteredBy = { enteredBy: { select: { id: true, name: true, role: true } } } as const;
const order = (r: { schoolYear: string; window: string }) => `${r.schoolYear}-${r.window}`;

/** Results newest first, plus the categories a form should ask for. */
export const listResults = query(async (input: { studentId: string }) => {
  const { studentId } = parse(z.object({ studentId: id }), input);
  await requireStudentAccess(studentId);
  const student = found(await db.student.findUnique({ where: { id: studentId } }), 'Student');
  const rows = await db.fastResult.findMany({ where: { studentId }, include: enteredBy });
  return {
    testType: isFastGrade(student.grade) ? 'FAST_MATH' : 'STAR_MATH',
    categories: categoriesFor(student.grade).map((c) => ({ id: c.id, name: AREA_LABEL[c.short], fullName: c.name })),
    results: rows.sort((a, b) => order(b).localeCompare(order(a))).map(resultDTO),
  };
});

const resultInput = z.object({
  id: id.optional(),
  studentId: id,
  schoolYear: z.string().regex(/^\d{4}–\d{2}$/, 'Choose the school year'),
  window: z.enum(['PM1', 'PM2', 'PM3'], 'Choose PM1, PM2 or PM3'),
  scaleScore: z.number('Enter the scale score from the score report').int('Enter the scale score from the score report').min(1, 'Enter the scale score from the score report').max(1000),
  level: z.number().int().nullish(),
  percentile: z.number().int().nullish(),
  categories: z.array(z.object({ categoryId: z.string().max(40), level: z.number().int().min(1, 'Area levels are 1 to 5').max(5, 'Area levels are 1 to 5') })).max(10).default([]),
});

/**
 * Add or correct a result.
 * FAST: scale score + level 1–5 (+ optional area levels). Star Math: scale score + optional percentile.
 */
export const saveResult = action(async (input: z.input<typeof resultInput>) => {
  const v = parse(resultInput, input);
  const user = await requireStudentAccess(v.studentId);
  const student = found(await db.student.findUnique({ where: { id: v.studentId } }), 'Student');
  const fast = isFastGrade(student.grade);
  if (fast) need(v.level != null && v.level >= 1 && v.level <= 5, 'Choose the level, 1 to 5');
  if (!fast && v.percentile != null) need(v.percentile >= 1 && v.percentile <= 99, 'Percentile rank is 1 to 99');
  const allowed = new Set(categoriesFor(student.grade).map((c) => c.id));
  need(v.categories.every((c) => allowed.has(c.categoryId)), 'That area isn’t on this grade’s test');

  if (v.id) {
    const existing = found(await db.fastResult.findFirst({ where: { id: v.id, studentId: v.studentId } }), 'Result');
    if (user.role !== 'ADMIN') need(existing.enteredById === user.id, 'Only Vienne can change a result someone else entered', 'FORBIDDEN');
  }
  const dupe = await db.fastResult.findFirst({ where: { studentId: v.studentId, schoolYear: v.schoolYear, window: v.window, ...(v.id && { id: { not: v.id } }) } });
  need(!dupe, `${v.window} ${v.schoolYear} is already entered. Edit that one instead.`);

  const fields = {
    schoolYear: v.schoolYear,
    window: v.window,
    scaleScore: v.scaleScore,
    level: fast ? v.level! : null,
    percentile: fast ? null : (v.percentile ?? null),
    categories: fast ? v.categories : [],
    enteredById: user.id,
    enteredAt: new Date(),
  };
  const row = v.id
    ? await db.fastResult.update({ where: { id: v.id }, data: fields, include: enteredBy })
    : await db.fastResult.create({ data: { studentId: v.studentId, testType: fast ? 'FAST_MATH' : 'STAR_MATH', gradeTested: student.grade, ...fields }, include: enteredBy });
  return resultDTO(row);
});

export const deleteResult = action(async (input: { id: string }) => {
  const v = parse(z.object({ id }), input);
  const r = found(await db.fastResult.findUnique({ where: { id: v.id } }), 'Result');
  const user = await requireStudentAccess(r.studentId);
  if (user.role !== 'ADMIN') need(r.enteredById === user.id, 'Only Vienne can remove a result someone else entered', 'FORBIDDEN');
  await db.fastResult.delete({ where: { id: r.id } });
  return r;
});

/** The next or current testing window (Today and parent Home). */
export const nextWindow = query(async () => {
  await requireUser();
  return nextFastWindow(await loadSettings());
});
