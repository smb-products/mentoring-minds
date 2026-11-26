'use server';
/**
 * server/reports — progress reports, published whenever Vienne chooses.
 * Parents only ever see published reports of their own children.
 * Contract: src/mock/server/reports.js
 */
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireActive, requireAdmin, requireStudentAccess } from '@/lib/guards';
import { action, ApiError, found, need, query } from '@/lib/result';
import { id, instant, parse } from '@/lib/validate';
import { reportDTO, reportInclude, studentDTO, studentInclude } from '@/lib/dto';
import { bookResultsFor, itemsFor } from '@/lib/book-results';
import { notify } from '@/lib/notify';

export const listForStudent = query(async (input: { studentId: string }) => {
  const { studentId } = parse(z.object({ studentId: id }), input);
  const user = await requireStudentAccess(studentId);
  const rows = await db.progressReport.findMany({
    where: { studentId, ...(user.role !== 'ADMIN' && { status: 'PUBLISHED' }) },
    include: reportInclude,
    orderBy: { periodEnd: 'desc' },
  });
  return rows.map(reportDTO);
});

/** periodStart defaults to the end of the last report, or the first session. */
export const createDraft = action(async (input: { studentId: string }) => {
  await requireAdmin();
  const { studentId } = parse(z.object({ studentId: id }), input);
  found(await db.student.findUnique({ where: { id: studentId } }), 'Student');
  const [last, first] = await Promise.all([
    db.progressReport.findFirst({ where: { studentId }, orderBy: { periodEnd: 'desc' } }),
    db.session.findFirst({ where: { studentId }, orderBy: { startsAt: 'asc' } }),
  ]);
  const now = new Date();
  const row = await db.progressReport.create({ data: { studentId, periodStart: last?.periodEnd ?? first?.startsAt ?? now, periodEnd: now, summary: '' }, include: reportInclude });
  return reportDTO(row);
});

export const updateReport = action(async (input: { reportId: string; summary?: string; periodStart?: string; periodEnd?: string }) => {
  await requireAdmin();
  const v = parse(z.object({ reportId: id, summary: z.string().max(6000).optional(), periodStart: instant.optional(), periodEnd: instant.optional() }), input);
  const cur = found(await db.progressReport.findUnique({ where: { id: v.reportId } }), 'Report');
  need((v.periodEnd ?? cur.periodEnd) >= (v.periodStart ?? cur.periodStart), 'The report period is backwards');
  const row = await db.progressReport.update({
    where: { id: v.reportId },
    data: { ...(v.summary !== undefined && { summary: v.summary }), ...(v.periodStart && { periodStart: v.periodStart }), ...(v.periodEnd && { periodEnd: v.periodEnd }) },
    include: reportInclude,
  });
  return reportDTO(row);
});

/** Replaces the report's ratings. ratings: [{ skillId, rating (1–4), comment? }] */
export const setRatings = action(async (input: { reportId: string; ratings: { skillId: string; rating: number; comment?: string | null }[] }) => {
  await requireAdmin();
  const v = parse(
    z.object({
      reportId: id,
      ratings: z.array(z.object({ skillId: id, rating: z.number().int().min(1, 'Ratings are 1–4').max(4, 'Ratings are 1–4'), comment: z.string().trim().max(500).nullish() })).max(60),
    }),
    input,
  );
  found(await db.progressReport.findUnique({ where: { id: v.reportId } }), 'Report');
  const skillIds = [...new Set(v.ratings.map((r) => r.skillId))];
  need(skillIds.length === v.ratings.length, 'A skill is rated twice');
  need((await db.skill.count({ where: { id: { in: skillIds } } })) === skillIds.length, 'One of those skills wasn’t found');
  await db.$transaction([
    db.reportRating.deleteMany({ where: { reportId: v.reportId } }),
    db.reportRating.createMany({ data: v.ratings.map((r) => ({ reportId: v.reportId, skillId: r.skillId, rating: r.rating, comment: r.comment || null })) }),
  ]);
  return reportDTO(await db.progressReport.findUniqueOrThrow({ where: { id: v.reportId }, include: reportInclude }));
});

export const publishReport = action(async (input: { reportId: string }) => {
  await requireAdmin();
  const { reportId } = parse(z.object({ reportId: id }), input);
  const r = found(await db.progressReport.findUnique({ where: { id: reportId }, include: { student: true, _count: { select: { ratings: true } } } }), 'Report');
  need(r.summary.trim(), 'Write a summary before publishing');
  need(r._count.ratings, 'Rate at least one skill');
  const row = await db.progressReport.update({ where: { id: reportId }, data: { status: 'PUBLISHED', publishedAt: r.publishedAt ?? new Date() }, include: reportInclude });
  if (r.status !== 'PUBLISHED') {
    await notify({ userId: r.student.parentId, audience: 'PARENT', type: 'REPORT_PUBLISHED', title: `New progress report for ${r.student.firstName}`, body: 'Vienne shared a new report.', href: '/parent/progress' });
  }
  return reportDTO(row);
});

/**
 * One report with its student (Vienne: any; a parent: published, own child only).
 * The session is checked before any lookup, and a family looks only among its own
 * children's reports, so another family's report and a missing id get the same answer.
 */
export const getReport = query(async (input: { reportId: string }) => {
  const user = await requireActive();
  const { reportId } = parse(z.object({ reportId: id }), input);
  const admin = user.role === 'ADMIN';
  const row = await db.progressReport.findFirst({ where: admin ? { id: reportId } : { id: reportId, student: { parentId: user.id } }, include: reportInclude });
  if (!admin && !row) throw new ApiError('FORBIDDEN', 'You don’t have access to this student.');
  const r = found(row, 'Report');
  need(admin || r.status === 'PUBLISHED', 'Report not found', 'NOT_FOUND');
  const s = await db.student.findUniqueOrThrow({ where: { id: r.studentId }, include: { ...studentInclude, parent: { select: { id: true, name: true } } } });

  // Book work in the period: handed in during it, or (not handed in) due during it.
  const subs = await db.submission.findMany({
    where: {
      studentId: s.id,
      assignment: { kind: 'BOOK' },
      OR: [{ submittedAt: { gte: r.periodStart, lte: r.periodEnd } }, { submittedAt: null, assignment: { dueAt: { gte: r.periodStart, lte: r.periodEnd } } }],
    },
    include: { assignment: true },
  });
  let questions = 0;
  for (const x of subs) questions += x.answers ? (x.answers as unknown[]).length : (await itemsFor(x.assignment)).length;
  const { parent, ...student } = s;
  return {
    ...reportDTO(r),
    student: studentDTO(student, { admin }),
    parent,
    bookWork: { done: subs.filter((x) => x.answers).length, assigned: subs.length, questions },
    bookAreas: await bookResultsFor(s, { from: r.periodStart, to: r.periodEnd }),
  };
});
