/** server/reports — progress reports, published whenever Vienne chooses. */
import { action, commit, getDb, need, newId, nowIso, requireAdmin, requireStudentAccess } from '../core';
import { reportDTO, studentDTO } from '../dto';
import { bookResultsFor, itemsFor } from './assignments';
import { notify } from './notifications';

/** Parents see published reports only. */
export async function listForStudent({ studentId }) {
  const user = requireStudentAccess(studentId);
  return getDb()
    .progressReports.filter((r) => r.studentId === studentId && (user.role === 'ADMIN' || r.status === 'PUBLISHED'))
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
    .map(reportDTO);
}

/** periodStart defaults to the end of the last report, or the first session. */
export const createDraft = action(async ({ studentId }) => {
  requireAdmin();
  return commit((db) => {
    const last = db.progressReports.filter((r) => r.studentId === studentId).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
    const first = db.sessions.filter((s) => s.studentId === studentId).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    const row = { id: newId('rep'), studentId, periodStart: last?.periodEnd ?? first?.startsAt ?? nowIso(), periodEnd: nowIso(), summary: '', status: 'DRAFT', publishedAt: null, createdAt: nowIso() };
    db.progressReports.push(row);
    return reportDTO(row);
  });
});

export const updateReport = action(async ({ reportId, summary, periodStart, periodEnd }) => {
  requireAdmin();
  return commit((db) => {
    const r = db.progressReports.find((x) => x.id === reportId);
    Object.assign(r, { ...(summary !== undefined && { summary }), ...(periodStart && { periodStart }), ...(periodEnd && { periodEnd }) });
    return reportDTO(r);
  });
});

/** ratings: [{ skillId, rating (1–4), comment? }] — replaces the report's ratings. */
export const setRatings = action(async ({ reportId, ratings }) => {
  requireAdmin();
  ratings.forEach((r) => need(r.rating >= 1 && r.rating <= 4, 'Ratings are 1–4'));
  return commit((db) => {
    db.reportRatings = db.reportRatings.filter((r) => r.reportId !== reportId).concat(ratings.map((r) => ({ id: newId('rr'), reportId, skillId: r.skillId, rating: r.rating, comment: r.comment || null })));
    return reportDTO(db.progressReports.find((x) => x.id === reportId));
  });
});

export const publishReport = action(async ({ reportId }) => {
  requireAdmin();
  return commit((db) => {
    const r = db.progressReports.find((x) => x.id === reportId);
    need(r.summary.trim(), 'Write a summary before publishing');
    need(db.reportRatings.some((x) => x.reportId === reportId), 'Rate at least one skill');
    Object.assign(r, { status: 'PUBLISHED', publishedAt: nowIso() });
    const student = db.students.find((s) => s.id === r.studentId);
    notify({ userId: student.parentId, audience: 'PARENT', type: 'REPORT_PUBLISHED', title: `New progress report for ${student.firstName}`, body: 'Vienne shared a new report.', href: '/parent/progress' });
    return reportDTO(r);
  });
});

/** One report with its student (admin: any; parent: published + own child only). */
export async function getReport({ reportId }) {
  const db = getDb();
  const r = db.progressReports.find((x) => x.id === reportId);
  need(r, 'Report not found');
  const user = requireStudentAccess(r.studentId);
  need(user.role === 'ADMIN' || r.status === 'PUBLISHED', 'Report not found');
  const s = db.students.find((x) => x.id === r.studentId);
  const inPeriod = db.submissions.filter((x) => x.studentId === s.id && x.assignmentId && db.assignments.find((a) => a.id === x.assignmentId)?.kind === 'BOOK' && (x.submittedAt ? x.submittedAt >= r.periodStart && x.submittedAt <= r.periodEnd : db.assignments.find((a) => a.id === x.assignmentId).dueAt <= r.periodEnd && db.assignments.find((a) => a.id === x.assignmentId).dueAt >= r.periodStart));
  const bookWork = { done: inPeriod.filter((x) => x.answers).length, assigned: inPeriod.length, questions: inPeriod.reduce((n, x) => n + (x.answers ? x.answers.length : itemsFor(db, db.assignments.find((a) => a.id === x.assignmentId)).length), 0) };
  return { ...reportDTO(r), student: studentDTO(s), parent: { id: s.parentId, name: db.users.find((u) => u.id === s.parentId)?.name }, bookWork, bookAreas: bookResultsFor(db, s, { from: r.periodStart, to: r.periodEnd }) };
}
