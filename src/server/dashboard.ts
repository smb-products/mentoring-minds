'use server';
/**
 * server/dashboard — one call per home screen. "Today" is Vienne's day in her time
 * zone (Settings.timezone), wherever the server runs.
 * Contract: src/mock/server/dashboard.js
 */
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin, requireStudentAccess } from '@/lib/guards';
import { found, query } from '@/lib/result';
import { id, parse } from '@/lib/validate';
import { bookSummary, reportDTO, reportInclude, sessionDTO, sessionForParent, sessionInclude, submissionDTOs, submissionInclude } from '@/lib/dto';
import { isFastGrade } from '@/lib/best';
import { loadSettings, nextFastWindow } from '@/lib/settings';
import { addDays, zonedDay, zonedToUtc } from '@/lib/time';
import { countUnread } from '@/lib/unread';

export const getAdminToday = query(async () => {
  const user = await requireAdmin();
  const settings = await loadSettings();
  const now = new Date();
  const today = zonedDay(now, settings.timezone);
  const from = zonedToUtc(today, 0, settings.timezone);
  const to = zonedToUtc(addDays(today, 1), 0, settings.timezone);
  const [sessionsToday, pendingRequests, grading, nextUp, unreadMessages, active, books] = await Promise.all([
    db.session.findMany({ where: { startsAt: { gte: from, lt: to }, status: { in: ['CONFIRMED', 'COMPLETED', 'NO_SHOW'] } }, include: sessionInclude, orderBy: { startsAt: 'asc' } }),
    db.session.findMany({ where: { status: 'REQUESTED' }, include: sessionInclude, orderBy: { startsAt: 'asc' } }),
    db.submission.findMany({ where: { status: 'SUBMITTED' }, include: submissionInclude, orderBy: { submittedAt: 'asc' } }),
    db.session.findMany({ where: { status: 'CONFIRMED', startsAt: { gte: to } }, include: sessionInclude, orderBy: { startsAt: 'asc' }, take: 4 }),
    countUnread(user),
    db.student.findMany({ where: { status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true, parentId: true, grade: true, hasBookAt: true } }),
    db.book.findMany({ select: { grade: true } }),
  ]);
  const bookGrades = new Set(books.map((b) => b.grade));
  return {
    date: from,
    sessionsToday: sessionsToday.map(sessionDTO),
    pendingRequests: pendingRequests.map(sessionDTO),
    gradingQueue: await submissionDTOs(grading),
    nextUp: nextUp.map(sessionDTO),
    unreadMessages,
    fastWindow: nextFastWindow(settings, now),
    fastStudents: active.filter((s) => isFastGrade(s.grade)).length,
    needBook: active.filter((s) => !s.hasBookAt && bookGrades.has(s.grade)).map(({ id, firstName, lastName, parentId }) => ({ id, firstName, lastName, parentId })),
  };
});

export const getParentOverview = query(async (input: { studentId: string }) => {
  const { studentId } = parse(z.object({ studentId: id }), input);
  const user = await requireStudentAccess(studentId);
  const student = found(await db.student.findUnique({ where: { id: studentId } }), 'Student');
  const settings = await loadSettings();
  const now = new Date();
  const [next, pending, todo, stars, completedCount, lastDone, latestReport, unreadMessages, redoCount, book, results] = await Promise.all([
    db.session.findFirst({ where: { studentId, status: 'CONFIRMED', startsAt: { gt: now } }, include: sessionInclude, orderBy: { startsAt: 'asc' } }),
    db.session.findMany({ where: { studentId, status: 'REQUESTED' }, include: sessionInclude, orderBy: { startsAt: 'asc' } }),
    db.submission.findMany({ where: { studentId, status: { in: ['ASSIGNED', 'RETURNED'] } }, include: submissionInclude }),
    db.submission.aggregate({ where: { studentId }, _sum: { stars: true } }),
    db.submission.count({ where: { studentId, status: 'GRADED' } }),
    db.session.findMany({ where: { studentId, status: 'COMPLETED', note: { sharedWithParent: true } }, include: sessionInclude, orderBy: { startsAt: 'desc' }, take: 1 }),
    db.progressReport.findFirst({ where: { studentId, status: 'PUBLISHED' }, include: reportInclude, orderBy: { publishedAt: 'desc' } }),
    countUnread(user),
    db.redoItem.count({ where: { studentId, clearedAt: null } }),
    db.book.findUnique({ where: { grade: student.grade } }),
    db.fastResult.findMany({ where: { studentId } }),
  ]);
  const todoDTOs = await submissionDTOs(todo);
  return {
    nextSession: next ? sessionForParent(next, settings, now) : null,
    pendingRequests: pending.map((s) => sessionForParent(s, settings, now)),
    todo: todoDTOs.sort((a, b) => (a.assignment?.dueAt?.toISOString() ?? '').localeCompare(b.assignment?.dueAt?.toISOString() ?? '')),
    starsTotal: stars._sum.stars ?? 0,
    completedCount,
    lastSessionNote: lastDone[0] ? sessionForParent(lastDone[0], settings, now) : null,
    latestReport: latestReport ? reportDTO(latestReport) : null,
    unreadMessages,
    joinOpensMin: settings.joinOpensMin,
    redoCount,
    book: bookSummary(book),
    hasBookAt: student.hasBookAt,
    fastWindow: isFastGrade(student.grade) ? nextFastWindow(settings, now) : null,
    latestResult: [...results].sort((a, b) => `${b.schoolYear}${b.window}`.localeCompare(`${a.schoolYear}${a.window}`))[0] ?? null,
  };
});
