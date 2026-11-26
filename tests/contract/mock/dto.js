/**
 * Shapes returned to the UI — the same as a Prisma query with `include`/`select`.
 * Keeping these in one place is the contract: the real server/ functions must
 * return exactly these fields (see CONTRACT.md).
 */
import { getDb } from './core';
import { areaFor, skillArea } from './best';

const db = () => getDb();
const byId = (list, id) => list.find((x) => x.id === id) ?? null;

export const subjectDTO = (id) => {
  const s = byId(db().subjects, id);
  return s && { id: s.id, name: s.name, color: s.color };
};

export const studentSummary = (s) =>
  s && { id: s.id, firstName: s.firstName, lastName: s.lastName, grade: s.grade, avatarColor: s.avatarColor, parentId: s.parentId };

export function studentDTO(student) {
  const d = db();
  return {
    ...student,
    subjects: d.studentSubjects.filter((x) => x.studentId === student.id).map((x) => subjectDTO(x.subjectId)),
  };
}

export const userSummary = (u) => u && { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, status: u.status, image: u.image };

export function sessionDTO(session) {
  const d = db();
  const note = d.sessionNotes.find((n) => n.sessionId === session.id) ?? null;
  return {
    ...session,
    student: studentSummary(byId(d.students, session.studentId)),
    subject: subjectDTO(session.subjectId),
    location: byId(d.locations, session.locationId),
    requestedBy: userSummary(byId(d.users, session.requestedById)),
    note: note && {
      ...note,
      skills: d.sessionNoteSkills.filter((x) => x.sessionNoteId === note.id).map((x) => byId(d.skills, x.skillId)),
    },
  };
}

/** When the Join call button shows for a video session. */
export const joinWindow = (session) => {
  const opensMin = db().settings.joinOpensMin;
  return { opensAt: new Date(new Date(session.startsAt).getTime() - opensMin * 60000).toISOString(), closesAt: session.endsAt };
};

/**
 * For parents: private notes hidden, and the video link only inside the join
 * window (from joinOpensMin before the start until the end).
 */
export function sessionForParent(session) {
  const dto = sessionDTO(session);
  if (dto.note && !dto.note.sharedWithParent) dto.note = null;
  if (dto.mode === 'VIDEO') {
    const { opensAt, closesAt } = joinWindow(session);
    const open = Date.now() >= new Date(opensAt).getTime() && Date.now() <= new Date(closesAt).getTime();
    dto.joinOpensAt = opensAt;
    if (!open || dto.status !== 'CONFIRMED') dto.meetingUrl = null;
  }
  return dto;
}

export function resourceDTO(resource) {
  const d = db();
  return {
    ...resource,
    subject: resource.subjectId ? subjectDTO(resource.subjectId) : null,
    file: resource.fileId ? byId(d.fileAssets, resource.fileId) : null,
    tags: d.resourceTags.filter((x) => x.resourceId === resource.id).map((x) => byId(d.tags, x.tagId)),
    sharedWith: d.resourceShares.filter((x) => x.resourceId === resource.id).map((x) => studentSummary(byId(d.students, x.studentId))),
  };
}

/** Preview (locked) accounts only ever receive this. Never fileId / url / body. */
export const resourceTeaser = (r) => ({
  id: r.id, title: r.title, kind: r.kind, subject: r.subjectId ? subjectDTO(r.subjectId) : null, gradeMin: r.gradeMin, gradeMax: r.gradeMax, locked: true,
});

/** A book question. The answer key is admin-only: `withAnswer: false` for families. */
export function bookItemDTO(item, { grade, withAnswer = true } = {}) {
  const book = byId(db().books, item.bookId);
  const g = grade ?? book?.grade;
  const base = { ...item, area: areaFor(g, { code: item.benchmarkCode }) };
  if (!withAnswer) delete base.answer;
  return base;
}

export const bookSummary = (book) => book && { id: book.id, title: book.title, grade: book.grade, tests: book.tests, buyUrl: book.buyUrl };

export function submissionDTO(sub) {
  const d = db();
  const assignment = byId(d.assignments, sub.assignmentId);
  return {
    ...sub,
    student: studentSummary(byId(d.students, sub.studentId)),
    assignment: assignment && {
      id: assignment.id, title: assignment.title, kind: assignment.kind, dueAt: assignment.dueAt, bookId: assignment.bookId, bookTest: assignment.bookTest, bookFrom: assignment.bookFrom, bookTo: assignment.bookTo,
      book: bookSummary(byId(d.books, assignment.bookId)),
    },
    file: sub.fileId ? byId(d.fileAssets, sub.fileId) : null,
    photos: (sub.photos || []).map((p) => ({ ...p, file: p.fileId ? byId(d.fileAssets, p.fileId) : null })),
  };
}

/** Ratings carry the FAST area (grades 3–6) or B.E.S.T. strand (K–2) they count toward. */
export function reportDTO(report) {
  const d = db();
  const grade = byId(d.students, report.studentId)?.grade ?? 0;
  return {
    ...report,
    ratings: d.reportRatings
      .filter((r) => r.reportId === report.id)
      .map((r) => {
        const skill = byId(d.skills, r.skillId);
        return { ...r, skill, area: skillArea(grade, skill) };
      }),
  };
}
