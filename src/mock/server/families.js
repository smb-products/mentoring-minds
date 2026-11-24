/** server/families — parents, their children, account status. */
import { action, commit, getDb, need, newId, nowIso, requireAdmin, requireStudentAccess, requireUser } from '../core';
import { reportDTO, sessionDTO, studentDTO, submissionDTO, userSummary } from '../dto';
import { bookResultsFor } from './assignments';

const upcoming = (db, studentIds) =>
  db.sessions
    .filter((s) => studentIds.includes(s.studentId) && s.status === 'CONFIRMED' && new Date(s.startsAt) > new Date())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;

export async function listFamilies({ status } = {}) {
  requireAdmin();
  const db = getDb();
  return db.users
    .filter((u) => u.role === 'PARENT' && (!status || u.status === status))
    .map((parent) => {
      const students = db.students.filter((s) => s.parentId === parent.id && s.status !== 'ARCHIVED').map((s) => ({
        ...studentDTO(s),
        hasBook: db.books.some((b) => b.grade === s.grade) ? !!s.hasBookAt : null,
        latestLevel: db.fastResults.filter((r) => r.studentId === s.id && r.level).sort((a, b) => `${b.schoolYear}${b.window}`.localeCompare(`${a.schoolYear}${a.window}`))[0]?.level ?? null,
      }));
      const next = upcoming(db, students.map((s) => s.id));
      const conversation = db.conversations.find((c) => c.parentId === parent.id);
      const done = db.sessions.filter((x) => students.some((st) => st.id === x.studentId) && x.status === 'COMPLETED').sort((a, b) => b.startsAt.localeCompare(a.startsAt));
      return { ...userSummary(parent), createdAt: parent.createdAt, students, nextSession: next && sessionDTO(next), lastSessionAt: done[0]?.startsAt ?? null, completedSessions: done.length, conversationId: conversation?.id ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getFamily({ parentId }) {
  const user = requireUser();
  if (user.role !== 'ADMIN') need(user.id === parentId, 'Not your family');
  const db = getDb();
  const parent = db.users.find((u) => u.id === parentId);
  need(parent, 'Family not found');
  const students = db.students.filter((s) => s.parentId === parentId && s.status !== 'ARCHIVED').map((s) => {
    const dto = studentDTO(s);
    if (user.role !== 'ADMIN') delete dto.adminNotes;
    const next = upcoming(db, [s.id]);
    dto.stats = {
      completedSessions: db.sessions.filter((x) => x.studentId === s.id && x.status === 'COMPLETED').length,
      stars: db.submissions.filter((x) => x.studentId === s.id).reduce((n, x) => n + (x.stars || 0), 0),
      nextSessionAt: next?.startsAt ?? null,
      redoCount: db.redoItems.filter((r) => r.studentId === s.id && !r.clearedAt).length,
    };
    dto.hasBook = db.books.some((b) => b.grade === s.grade) ? !!s.hasBookAt : null;
    dto.latestResult = db.fastResults.filter((r) => r.studentId === s.id).sort((a, b) => `${b.schoolYear}${b.window}`.localeCompare(`${a.schoolYear}${a.window}`))[0] ?? null;
    dto.bookAreas = bookResultsFor(db, s);
    return dto;
  });
  const ids = students.map((s) => s.id);
  const sessions = db.sessions.filter((s) => ids.includes(s.studentId)).sort((a, b) => b.startsAt.localeCompare(a.startsAt)).map(sessionDTO);
  const reports = user.role === 'ADMIN' ? db.progressReports.filter((r) => ids.includes(r.studentId)).map(reportDTO) : [];
  const conversation = db.conversations.find((c) => c.parentId === parentId) ?? null;
  const recentWork = db.submissions.filter((x) => ids.includes(x.studentId) && x.submittedAt).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 8).map(submissionDTO);
  return { parent: { ...userSummary(parent), createdAt: parent.createdAt }, students, sessions, reports, recentWork, conversationId: conversation?.id ?? null };
}

export const updateParent = action(async ({ parentId, name, phone }) => {
  requireAdmin();
  return commit((db) => {
    const p = db.users.find((u) => u.id === parentId);
    need(p, 'Parent not found');
    Object.assign(p, { ...(name && { name }), ...(phone !== undefined && { phone }), updatedAt: nowIso() });
    return userSummary(p);
  });
});

export const setParentStatus = action(async ({ parentId, status }) => {
  requireAdmin();
  need(['ACTIVE', 'PAUSED', 'PREVIEW'].includes(status), 'Unknown status');
  return commit((db) => {
    const p = db.users.find((u) => u.id === parentId);
    p.status = status;
    p.updatedAt = nowIso();
    return userSummary(p);
  });
});

/** Returns a one-time temporary password for Vienne to pass on (no email yet). */
export const resetParentPassword = action(async ({ parentId }) => {
  requireAdmin();
  const temp = `mm-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}`;
  commit((db) => {
    const p = db.users.find((u) => u.id === parentId);
    p.passwordHash = 'reset';
    p.updatedAt = nowIso();
  });
  return { temporaryPassword: temp };
});

export const addStudent = action(async ({ parentId, firstName, lastName, grade, school, goals }) => {
  requireAdmin();
  need(firstName?.trim(), 'First name is required');
  need(grade >= 0 && grade <= 6, 'Grade must be K–6');
  return commit((db) => {
    const now = nowIso();
    const student = { id: newId('s'), parentId, firstName: firstName.trim(), lastName: lastName?.trim() || '', grade, school: school?.trim() || null, schoolYear: '2026–27', goals: goals || null, adminNotes: null, avatarColor: 'brand', status: 'ACTIVE', hasBookAt: null, createdAt: now, updatedAt: now };
    db.students.push(student);
    db.studentSubjects.push({ studentId: student.id, subjectId: 'sub_math' });
    return studentDTO(student);
  });
});

export const updateStudent = action(async ({ studentId, subjectIds, ...patch }) => {
  const user = requireStudentAccess(studentId);
  const allowed = user.role === 'ADMIN' ? ['firstName', 'lastName', 'grade', 'school', 'goals', 'adminNotes', 'status'] : ['goals', 'school'];
  Object.keys(patch).forEach((k) => need(allowed.includes(k), `You can’t change ${k}`));
  return commit((db) => {
    const s = db.students.find((x) => x.id === studentId);
    // Moving up a grade means a new book: ask the family again.
    if (patch.grade !== undefined && patch.grade !== s.grade) s.hasBookAt = null;
    Object.assign(s, patch, { updatedAt: nowIso() });
    if (subjectIds && user.role === 'ADMIN') {
      db.studentSubjects = db.studentSubjects.filter((x) => x.studentId !== studentId).concat(subjectIds.map((subjectId) => ({ studentId, subjectId })));
    }
    return studentDTO(s);
  });
});

export const archiveStudent = action(async ({ studentId }) => {
  requireAdmin();
  commit((db) => {
    const s = db.students.find((x) => x.id === studentId);
    s.status = 'ARCHIVED';
    s.updatedAt = nowIso();
  });
});

/** Bigger text and buttons for the signed-in user (applied app-wide). */
export const setTextSize = action(async ({ textSize }) => {
  const user = requireUser();
  need(['NORMAL', 'LARGE', 'XLARGE'].includes(textSize), 'Choose a text size');
  return commit((db) => {
    db.users.find((u) => u.id === user.id).textSize = textSize;
    return { textSize };
  });
});
