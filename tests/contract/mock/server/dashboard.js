/** server/dashboard — one call per home screen. */
import { getDb, requireAdmin, requireStudentAccess } from '../core';
import { reportDTO, sessionDTO, sessionForParent, submissionDTO } from '../dto';
import { unreadCount } from './messages';
import { nextWindow } from './fast';
import { bookSummary } from '../dto';
import { isFastGrade } from '../best';

const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export async function getAdminToday() {
  requireAdmin();
  const db = getDb();
  const from = startOfDay();
  const to = new Date(from.getTime() + 86400000);
  const inDay = (s) => new Date(s.startsAt) >= from && new Date(s.startsAt) < to;
  return {
    date: from.toISOString(),
    sessionsToday: db.sessions.filter((s) => inDay(s) && ['CONFIRMED', 'COMPLETED', 'NO_SHOW'].includes(s.status)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map(sessionDTO),
    pendingRequests: db.sessions.filter((s) => s.status === 'REQUESTED').sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map(sessionDTO),
    gradingQueue: db.submissions.filter((s) => s.status === 'SUBMITTED').map(submissionDTO),
    nextUp: db.sessions.filter((s) => s.status === 'CONFIRMED' && new Date(s.startsAt) >= to).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 4).map(sessionDTO),
    unreadMessages: await unreadCount(),
    fastWindow: await nextWindow(),
    fastStudents: db.students.filter((s) => s.status === 'ACTIVE' && isFastGrade(s.grade)).length,
    needBook: db.students.filter((s) => s.status === 'ACTIVE' && !s.hasBookAt && db.books.some((b) => b.grade === s.grade)).map((s) => ({ id: s.id, firstName: s.firstName, lastName: s.lastName, parentId: s.parentId })),
  };
}

export async function getParentOverview({ studentId }) {
  requireStudentAccess(studentId);
  const db = getDb();
  const now = new Date();
  const student = db.students.find((s) => s.id === studentId);
  const sessions = db.sessions.filter((s) => s.studentId === studentId);
  const subs = db.submissions.filter((s) => s.studentId === studentId);
  const lastNote = sessions
    .filter((s) => s.status === 'COMPLETED')
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .map(sessionForParent)
    .find((s) => s.note);
  const latestReport = db.progressReports.filter((r) => r.studentId === studentId && r.status === 'PUBLISHED').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  return {
    nextSession: sessions.filter((s) => s.status === 'CONFIRMED' && new Date(s.startsAt) > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map(sessionForParent)[0] ?? null,
    pendingRequests: sessions.filter((s) => s.status === 'REQUESTED').map(sessionForParent),
    todo: subs.filter((s) => ['ASSIGNED', 'RETURNED'].includes(s.status)).map(submissionDTO).sort((a, b) => (a.assignment.dueAt || '').localeCompare(b.assignment.dueAt || '')),
    starsTotal: subs.reduce((n, s) => n + (s.stars || 0), 0),
    completedCount: subs.filter((s) => s.status === 'GRADED').length,
    lastSessionNote: lastNote ?? null,
    latestReport: latestReport ? reportDTO(latestReport) : null,
    unreadMessages: await unreadCount(),
    joinOpensMin: db.settings.joinOpensMin,
    redoCount: db.redoItems.filter((r) => r.studentId === studentId && !r.clearedAt).length,
    book: bookSummary(db.books.find((b) => b.grade === student.grade)),
    hasBookAt: student.hasBookAt,
    fastWindow: isFastGrade(student.grade) ? await nextWindow() : null,
    latestResult: db.fastResults.filter((r) => r.studentId === studentId).sort((a, b) => `${b.schoolYear}${b.window}`.localeCompare(`${a.schoolYear}${a.window}`))[0] ?? null,
  };
}
