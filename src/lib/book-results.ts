import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { areaFor } from './best';
import type { ScoredAnswer } from './dto';

type AssignmentRange = { kind: string; bookId: string | null; bookTest: string | null; bookFrom: number | null; bookTo: number | null };

/** The book questions an assignment covers, in order. */
export function itemsFor(a: AssignmentRange, tx: Prisma.TransactionClient | typeof db = db) {
  if (a.kind !== 'BOOK' || !a.bookId || !a.bookTest) return Promise.resolve([]);
  return tx.bookItem.findMany({ where: { bookId: a.bookId, test: a.bookTest, number: { gte: a.bookFrom ?? 1, lte: a.bookTo ?? 999 } }, orderBy: { number: 'asc' } });
}

export type AreaResult = { id: string; name: string; fullName: string; right: number; total: number };

/**
 * A student's book results by FAST area (grades 3–6) or strand (K–2), weakest
 * first. Optional period filters on hand-in time.
 */
export async function bookResultsFor(student: { id: string; grade: number }, period: { from?: Date; to?: Date } = {}): Promise<AreaResult[]> {
  const subs = await db.submission.findMany({
    where: {
      studentId: student.id,
      answers: { not: Prisma.DbNull },
      ...((period.from || period.to) && { submittedAt: { ...(period.from && { gte: period.from }), ...(period.to && { lte: period.to }) } }),
    },
    include: { assignment: true },
  });
  const books = [...new Set(subs.map((s) => s.assignment.bookId).filter(Boolean))] as string[];
  const items = books.length ? await db.bookItem.findMany({ where: { bookId: { in: books } } }) : [];
  const areas = new Map<string, AreaResult>();
  for (const s of subs) {
    if (!s.answers) continue;
    for (const ans of s.answers as ScoredAnswer[]) {
      if (ans.correct == null) continue;
      const item = items.find((it) => it.bookId === s.assignment.bookId && it.test === s.assignment.bookTest && it.number === ans.number);
      const area = areaFor(student.grade, { code: item?.benchmarkCode });
      const row = areas.get(area.id) ?? { ...area, right: 0, total: 0 };
      row.total += 1;
      if (ans.correct) row.right += 1;
      areas.set(area.id, row);
    }
  }
  return [...areas.values()].sort((a, b) => a.right / a.total - b.right / b.total);
}
