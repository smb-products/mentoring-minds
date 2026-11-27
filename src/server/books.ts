'use server';
/**
 * server/books — the Florida Test Prep F.A.S.T. book per grade, Vienne's answer
 * key, and each student's redo list. The app stores where a question is, what it
 * tests and its answer — never the question text or page images. The answer key
 * only ever goes to Vienne.
 * Contract: tests/contract/mock/server/books.js (the frozen mock)
 */
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin, requireStudentAccess, requireUser } from '@/lib/guards';
import { action, found, need, query } from '@/lib/result';
import { grade as gradeSchema, id, ids, parse, testKey } from '@/lib/validate';
import { bookItemDTO, bookSummary, testsOf } from '@/lib/dto';
import { codesForGrade } from '@/lib/best';

const FORMATS = ['MC', 'MULTI', 'NUMERIC', 'OPEN'] as const;

/** Books with how much of each test's key is entered. */
export const listBooks = query(async () => {
  await requireUser();
  const [books, keyed, students] = await Promise.all([
    db.book.findMany({ orderBy: { grade: 'asc' } }),
    db.bookItem.groupBy({ by: ['bookId', 'test'], _count: true }),
    db.student.findMany({ where: { status: 'ACTIVE' }, select: { grade: true, hasBookAt: true } }),
  ]);
  return books.map((b) => ({
    ...bookSummary(b)!,
    tests: testsOf(b).map((t) => ({ ...t, keyed: keyed.find((k) => k.bookId === b.id && k.test === t.key)?._count ?? 0 })),
    studentsWithBook: students.filter((s) => s.grade === b.grade && s.hasBookAt).length,
    studentsInGrade: students.filter((s) => s.grade === b.grade).length,
  }));
});

async function bookAndTest(bookId: string, test: string) {
  const book = found(await db.book.findUnique({ where: { id: bookId } }), 'Book');
  const t = found(testsOf(book).find((x) => x.key === test), 'Test');
  return { book, t };
}

/** One test's answer key (Vienne only). */
export const getAnswerKey = query(async (input: { bookId: string; test: string }) => {
  await requireAdmin();
  const v = parse(z.object({ bookId: id, test: testKey }), input);
  const { book, t } = await bookAndTest(v.bookId, v.test);
  const items = await db.bookItem.findMany({ where: { bookId: book.id, test: t.key }, orderBy: { number: 'asc' } });
  return { book: bookSummary(book), test: t, items: items.map((i) => bookItemDTO(i, { grade: book.grade, withAnswer: true })), codes: codesForGrade(book.grade) };
});

const keyRow = z.object({
  number: z.number().int(),
  format: z.enum(FORMATS, 'Choose a format'),
  answer: z.string().trim().max(40).nullish(),
  choiceCount: z.number().int().min(2).max(8).nullish(),
  benchmarkCode: z.string().trim().max(30).nullish(),
  points: z.number().int().min(1).max(10).nullish(),
});

/** Normalized answer as stored. */
const stored = (format: (typeof FORMATS)[number], answer: string | null | undefined) =>
  format === 'OPEN' ? null : format === 'MULTI' ? answer!.toUpperCase().replace(/\s/g, '') : answer!.trim().toUpperCase();

/**
 * Save one test, or one page of it. Rows for those numbers are replaced in place
 * (redo lists that point at them are kept). Answers must fit their format.
 */
export const saveAnswerKey = action(
  async (input: { bookId: string; test: string; rows: z.input<typeof keyRow>[] }) => {
    await requireAdmin();
    const v = parse(z.object({ bookId: id, test: testKey, rows: z.array(keyRow).min(1, 'Nothing to save').max(100) }), input);
    const { book, t } = await bookAndTest(v.bookId, v.test);
    const codes = codesForGrade(book.grade);
    for (const r of v.rows) {
      need(r.number >= 1 && r.number <= t.count, `#${r.number} isn’t in ${t.name} (1–${t.count})`);
      if (r.format === 'MC') need(/^[A-D]$/i.test(r.answer || ''), `#${r.number}: the answer should be one letter, A to D`);
      if (r.format === 'MULTI') need(/^[A-F](\s*,\s*[A-F])+$/i.test(r.answer || ''), `#${r.number}: list two or more letters, like A, C`);
      if (r.format === 'NUMERIC') need(/^-?\d+(\.\d+)?$|^-?\d+\/\d+$|^-?\d+ \d+\/\d+$/.test((r.answer || '').trim()), `#${r.number}: the answer should be a number or fraction, like 12, 0.5 or 3/4`);
      need(!r.benchmarkCode || codes.length === 0 || codes.includes(r.benchmarkCode), `#${r.number}: that standard isn’t a grade ${book.grade} standard`);
    }
    const numbers = v.rows.map((r) => r.number);
    need(new Set(numbers).size === numbers.length, 'A question number appears twice');

    await db.$transaction(async (tx) => {
      for (const r of v.rows) {
        const data = {
          format: r.format,
          choiceCount: r.format === 'MC' ? 4 : r.format === 'MULTI' ? r.choiceCount || 5 : null,
          answer: stored(r.format, r.answer),
          benchmarkCode: r.benchmarkCode || null,
          points: r.points || (r.format === 'OPEN' ? 2 : 1),
        };
        await tx.bookItem.upsert({ where: { bookId_test_number: { bookId: book.id, test: t.key, number: r.number } }, create: { bookId: book.id, test: t.key, number: r.number, ...data }, update: data });
      }    });
    return db.bookItem.count({ where: { bookId: book.id, test: t.key } });
  },
);

/** Book for a grade (parents see it in the "Get the book" step). */
export const bookForGrade = query(async (input: { grade: number }) => {
  await requireUser();
  const { grade } = parse(z.object({ grade: gradeSchema }), input);
  return bookSummary(await db.book.findUnique({ where: { grade } }));
});

/** A parent (or Vienne) confirms the family has the book. */
export const setHasBook = action(async (input: { studentId: string; hasBook?: boolean }) => {
  const v = parse(z.object({ studentId: id, hasBook: z.boolean().default(true) }), input);
  await requireStudentAccess(v.studentId);
  const s = await db.student.update({ where: { id: v.studentId }, data: { hasBookAt: v.hasBook ? new Date() : null } });
  return { studentId: s.id, hasBookAt: s.hasBookAt };
});

/* ── Redo list ──────────────────────────────────────────── */

/** Open redo items, without answers (families see this list). */
export const listRedo = query(async (input: { studentId: string }) => {
  const { studentId } = parse(z.object({ studentId: id }), input);
  await requireStudentAccess(studentId);
  const student = found(await db.student.findUnique({ where: { id: studentId } }), 'Student');
  const rows = await db.redoItem.findMany({ where: { studentId, clearedAt: null }, include: { bookItem: { include: { book: true } } } });
  return rows
    .map(({ bookItem: { book, ...item }, ...r }) => ({
      ...r,
      item: bookItemDTO(item, { grade: student.grade, withAnswer: false }),
      testName: testsOf(book).find((t) => t.key === item.test)?.name,
    }))
    .sort((a, b) => a.item.test.localeCompare(b.item.test) || a.item.number - b.item.number);
});

export const clearRedo = action(async (input: { redoIds: string[] }) => {
  await requireAdmin();
  const { redoIds } = parse(z.object({ redoIds: ids }), input);
  await db.redoItem.updateMany({ where: { id: { in: redoIds }, clearedAt: null }, data: { clearedAt: new Date() } });
  return null;
});

/** Vienne adds book questions to a redo list by test and numbers, e.g. "T2" [6, 14]. */
export const addRedo = action(async (input: { studentId: string; test: string; numbers: number[] }) => {
  await requireAdmin();
  const v = parse(z.object({ studentId: id, test: testKey, numbers: z.array(z.number().int().min(1).max(200)).min(1, 'Choose at least one question').max(100) }), input);
  const student = found(await db.student.findUnique({ where: { id: v.studentId } }), 'Student');
  const book = found(await db.book.findUnique({ where: { grade: student.grade } }), `Book for grade ${student.grade}`);
  const numbers = [...new Set(v.numbers)];
  const items = await db.bookItem.findMany({ where: { bookId: book.id, test: v.test, number: { in: numbers } } });
  need(items.length === numbers.length, 'Some of those questions aren’t in the answer key yet');
  await db.$transaction(async (tx) => {
    for (const item of items) {
      const open = await tx.redoItem.findFirst({ where: { studentId: student.id, bookItemId: item.id, clearedAt: null } });
      if (!open) await tx.redoItem.create({ data: { studentId: student.id, bookItemId: item.id, source: 'SESSION' } });
    }
  });
  return items.length;
});
