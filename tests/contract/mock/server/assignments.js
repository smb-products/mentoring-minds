/**
 * server/assignments — book homework with a digital answer sheet, plus simple
 * practice links. Book-only: there is no authored quiz bank (ADDITIONS.md §3).
 *
 *   BOOK      "Test 2, #1–20": the child works in their own book and fills in
 *             numbered answer slots. Graded on the server against Vienne's key;
 *             the key never reaches a family's device.
 *   PRACTICE  A link or resource (e.g. FLDOE sample questions). Marked done.
 */
import { action, ApiError, commit, getDb, need, newId, nowIso, requireAdmin, requireStudentAccess } from '../core';
import { bookItemDTO, bookSummary, submissionDTO } from '../dto';
import { areaFor } from '../best';
import { notify, notifyAdmins } from './notifications';

/** Stars: ≥90% = 3, ≥70% = 2, any finished sheet = 1. */
export const starsFor = (score, max) => (max === 0 ? 1 : score / max >= 0.9 ? 3 : score / max >= 0.7 ? 2 : 1);

export const itemsFor = (db, a) =>
  a.kind === 'BOOK'
    ? db.bookItems.filter((b) => b.bookId === a.bookId && b.test === a.bookTest && b.number >= a.bookFrom && b.number <= a.bookTo).sort((x, y) => x.number - y.number)
    : [];

/* ── Answer checking ───────────────────────────────────────── */
/** "3/4", "0.75", "1 1/2", ".5", "1,200" → number. Returns NaN when it isn't a number. */
export function toNumber(raw) {
  const v = String(raw ?? '').trim().replace(/,/g, '').replace(/\s+/g, ' ');
  if (!v) return NaN;
  const mixed = v.match(/^(-?\d+) (\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Math.sign(Number(mixed[1]) || 1) * (Number(mixed[2]) / Number(mixed[3]));
  const frac = v.match(/^(-?\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) === 0 ? NaN : Number(frac[1]) / Number(frac[2]);
  return /^-?\d*\.?\d+$/.test(v) ? Number(v) : NaN;
}
const letters = (v) => [...new Set(String(v ?? '').toUpperCase().replace(/[^A-Z]/g, '').split(''))].sort().join('');

/** Is `value` right for this book item? OPEN items return null (Vienne decides). */
export function check(item, value) {
  if (item.format === 'OPEN') return null;
  if (value == null || String(value).trim() === '') return false;
  if (item.format === 'NUMERIC') {
    const a = toNumber(value);
    const b = toNumber(item.answer);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
  }
  return letters(value) === letters(item.answer);
}

/* ── Vienne: lists and detail ──────────────────────────────── */
export async function listAssignments() {
  requireAdmin();
  const db = getDb();
  return [...db.assignments]
    .sort((a, b) => (b.dueAt || '').localeCompare(a.dueAt || ''))
    .map((a) => {
      const subs = db.submissions.filter((s) => s.assignmentId === a.id);
      const graded = subs.filter((s) => s.status === 'GRADED' && s.maxScore);
      return {
        ...a,
        book: bookSummary(db.books.find((b) => b.id === a.bookId)),
        questionCount: itemsFor(db, a).length,
        submissions: subs.map(submissionDTO),
        counts: {
          assigned: subs.length,
          done: subs.filter((s) => ['SUBMITTED', 'GRADED'].includes(s.status)).length,
          toGrade: subs.filter((s) => s.status === 'SUBMITTED').length,
        },
        averagePercent: graded.length ? Math.round((graded.reduce((n, s) => n + s.score / s.maxScore, 0) / graded.length) * 100) : null,
      };
    });
}

/**
 * One assignment with per-question results (how many got each number right)
 * and a summary by FAST area.
 */
export async function getAssignment({ assignmentId }) {
  requireAdmin();
  const db = getDb();
  const a = db.assignments.find((x) => x.id === assignmentId);
  need(a, 'Assignment not found');
  const book = db.books.find((b) => b.id === a.bookId);
  const items = itemsFor(db, a);
  const subs = db.submissions.filter((s) => s.assignmentId === a.id);
  const finished = subs.filter((s) => s.answers);
  const perItem = items.map((it) => {
    const results = finished.map((s) => s.answers.find((x) => x.number === it.number)?.correct);
    return { ...bookItemDTO(it, { grade: book.grade }), right: results.filter((x) => x === true).length, wrong: results.filter((x) => x === false).length, pending: results.filter((x) => x == null).length };
  });
  const areas = {};
  perItem.forEach((it) => {
    const k = it.area.id;
    areas[k] ??= { ...it.area, right: 0, total: 0 };
    areas[k].right += it.right;
    areas[k].total += it.right + it.wrong;
  });
  return { ...a, book: bookSummary(book), items: perItem, areas: Object.values(areas), submissions: subs.map(submissionDTO) };
}

/**
 * Assign book questions. `from`/`to` default to the whole test.
 * Requires the answer key for every question in the range.
 */
export const createBookAssignment = action(async ({ bookId, test, from = 1, to, dueAt, instructions, studentIds = [] }) => {
  requireAdmin();
  const db = getDb();
  const book = db.books.find((b) => b.id === bookId);
  need(book, 'Choose a book');
  const t = book.tests.find((x) => x.key === test);
  need(t, 'Choose a test');
  const last = Math.min(to ?? t.count, t.count);
  need(from >= 1 && from <= last, 'The question range is backwards');
  const keyed = db.bookItems.filter((b) => b.bookId === bookId && b.test === test && b.number >= from && b.number <= last);
  if (keyed.length < last - from + 1) throw new ApiError('NO_KEY', `Add the answer key for ${t.name} first (Content → Book).`);
  need(studentIds.length, 'Choose at least one student');
  const wrongGrade = studentIds.map((id) => db.students.find((s) => s.id === id)).filter((s) => s.grade !== book.grade);
  need(!wrongGrade.length, `${wrongGrade.map((s) => s.firstName).join(', ')} isn’t in grade ${book.grade}`);
  return commit((d) => {
    const range = from === 1 && last === t.count ? '' : `, #${from}–${last}`;
    const row = {
      id: newId('as'), title: `${t.name}${range}`, instructions: instructions?.trim() || 'Do these in your book, then fill in your answers here.', kind: 'BOOK', subjectId: 'sub_math',
      resourceId: null, bookId, bookTest: test, bookFrom: from, bookTo: last, dueAt: dueAt || null, createdAt: nowIso(),
    };
    d.assignments.push(row);
    studentIds.forEach((studentId) => d.submissions.push(blankSubmission(row.id, studentId)));
    studentIds.forEach((studentId) => {
      const st = d.students.find((s) => s.id === studentId);
      notify({ userId: st.parentId, audience: 'PARENT', type: 'ASSIGNMENT_GIVEN', title: `New book homework for ${st.firstName}`, body: row.title, href: '/parent/learning' });
    });
    return row;
  });
});

export const createPracticeAssignment = action(async ({ title, instructions, resourceId, dueAt, studentIds = [] }) => {
  requireAdmin();
  need(title?.trim(), 'Give it a title');
  need(studentIds.length, 'Choose at least one student');
  return commit((d) => {
    const row = { id: newId('as'), title: title.trim(), instructions: instructions || null, kind: 'PRACTICE', subjectId: 'sub_math', resourceId: resourceId || null, bookId: null, bookTest: null, bookFrom: null, bookTo: null, dueAt: dueAt || null, createdAt: nowIso() };
    d.assignments.push(row);
    studentIds.forEach((studentId) => d.submissions.push(blankSubmission(row.id, studentId)));
    return row;
  });
});

const blankSubmission = (assignmentId, studentId) => ({
  id: newId('sb'), assignmentId, studentId, status: 'ASSIGNED', answers: null, draft: null, photos: [], fileId: null, autoScore: null, score: null, maxScore: null,
  feedback: null, stars: 0, submittedById: null, submittedAt: null, gradedAt: null,
});

/* ── Families: the answer sheet ────────────────────────────── */
/**
 * A student's work. Book items are sent WITHOUT the answer; after grading each
 * slot carries `correct` so the child sees which ones to redo.
 */
export async function listForStudent({ studentId }) {
  requireStudentAccess(studentId);
  const db = getDb();
  const student = db.students.find((s) => s.id === studentId);
  return db.submissions
    .filter((s) => s.studentId === studentId)
    .map((s) => {
      const a = db.assignments.find((x) => x.id === s.assignmentId);
      return {
        ...submissionDTO(s),
        assignment: {
          ...a,
          book: bookSummary(db.books.find((b) => b.id === a.bookId)),
          resource: a.resourceId ? db.resources.find((r) => r.id === a.resourceId) : null,
          slots: itemsFor(db, a).map((it) => bookItemDTO(it, { grade: student.grade, withAnswer: false })),
        },
      };
    })
    .sort((a, b) => (a.assignment.dueAt || '').localeCompare(b.assignment.dueAt || ''));
}

/** Progress is saved as the child goes, so closing the app loses nothing. */
export const saveAnswerDraft = action(async ({ submissionId, answers }) => {
  const db = getDb();
  const sub = db.submissions.find((s) => s.id === submissionId);
  need(sub, 'Assignment not found');
  requireStudentAccess(sub.studentId);
  need(['ASSIGNED', 'RETURNED'].includes(sub.status), 'This was already handed in');
  return commit(() => {
    sub.draft = answers;
    return true;
  });
});

/**
 * Hand in an answer sheet. answers: [{ number, value }], photos: [{ number, fileId }] for
 * written (OPEN) questions. Scores on the server, adds misses to the redo list, and
 * waits for Vienne only when there are written answers to check.
 */
export const submitAnswerSheet = action(async ({ submissionId, answers = [], photos = [] }) => {
  const db = getDb();
  const sub = db.submissions.find((s) => s.id === submissionId);
  need(sub, 'Assignment not found');
  const user = requireStudentAccess(sub.studentId);
  need(['ASSIGNED', 'RETURNED'].includes(sub.status), 'This was already handed in');
  const a = db.assignments.find((x) => x.id === sub.assignmentId);
  need(a.kind === 'BOOK', 'This isn’t a book assignment');
  const items = itemsFor(db, a);
  const blank = items.filter((it) => it.format !== 'OPEN' && !String(answers.find((x) => x.number === it.number)?.value ?? '').trim());
  need(!blank.length, `Answer every question first. Still empty: #${blank.map((x) => x.number).join(', #')}`);
  const noPhoto = items.filter((it) => it.format === 'OPEN' && !photos.some((p) => p.number === it.number && p.fileId));
  need(!noPhoto.length, `Add a photo of your work for #${noPhoto.map((x) => x.number).join(', #')}`);
  return commit((d) => {
    const now = nowIso();
    const scored = items.map((it) => {
      const value = it.format === 'OPEN' ? null : answers.find((x) => x.number === it.number).value;
      return { number: it.number, value, correct: check(it, value) };
    });
    const max = items.reduce((t, it) => t + it.points, 0);
    const auto = items.filter((it, i) => scored[i].correct).reduce((t, it) => t + it.points, 0);
    const waiting = items.some((it) => it.format === 'OPEN');
    Object.assign(sub, {
      answers: scored, draft: null, photos: photos.filter((p) => items.some((it) => it.number === p.number)), autoScore: auto, maxScore: max,
      score: waiting ? null : auto, stars: waiting ? 0 : starsFor(auto, max), status: waiting ? 'SUBMITTED' : 'GRADED', submittedById: user.id, submittedAt: now, gradedAt: waiting ? null : now,
    });
    addMissesToRedo(d, sub, items);
    const student = d.students.find((s) => s.id === sub.studentId);
    const right = scored.filter((x) => x.correct).length;
    const auto_n = scored.filter((x) => x.correct !== null).length;
    notifyAdmins({ type: 'SUBMISSION_RECEIVED', title: `${student.firstName} finished ${a.title}`, body: `${right} of ${auto_n} right.${waiting ? ` ${items.length - auto_n} written ${items.length - auto_n === 1 ? 'answer' : 'answers'} to check.` : ''}`, href: `/admin/assignments/${a.id}` });
    return { ...submissionDTO(sub), slots: items.map((it) => bookItemDTO(it, { grade: student.grade, withAnswer: false })) };
  });
});

function addMissesToRedo(d, sub, items) {
  sub.answers.forEach((ans) => {
    if (ans.correct !== false) return;
    const item = items.find((it) => it.number === ans.number);
    if (d.redoItems.some((r) => r.studentId === sub.studentId && r.bookItemId === item.id && !r.clearedAt)) return;
    d.redoItems.push({ id: newId('redo'), studentId: sub.studentId, bookItemId: item.id, source: 'ANSWER_SHEET', submissionId: sub.id, createdAt: nowIso(), clearedAt: null });
  });
}

/** PRACTICE: the family taps Done. */
export const markPracticeDone = action(async ({ submissionId }) => {
  const db = getDb();
  const sub = db.submissions.find((s) => s.id === submissionId);
  need(sub, 'Assignment not found');
  const user = requireStudentAccess(sub.studentId);
  return commit(() => submissionDTO(Object.assign(sub, { status: 'GRADED', score: 1, maxScore: 1, stars: 3, submittedById: user.id, submittedAt: nowIso(), gradedAt: nowIso() })));
});

/* ── Vienne: grading written answers ───────────────────────── */
export async function gradingQueue() {
  requireAdmin();
  return getDb().submissions.filter((s) => s.status === 'SUBMITTED').sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).map(submissionDTO);
}

/**
 * Vienne marks the written answers (and may override any auto-marked one).
 * results: [{ number, correct }]
 */
export const gradeSubmission = action(async ({ submissionId, results = [], feedback }) => {
  requireAdmin();
  const db = getDb();
  const sub = db.submissions.find((s) => s.id === submissionId);
  need(sub?.answers, 'Nothing to grade yet');
  const a = db.assignments.find((x) => x.id === sub.assignmentId);
  const items = itemsFor(db, a);
  const open = items.filter((it) => it.format === 'OPEN');
  const missing = open.filter((it) => !results.some((r) => r.number === it.number) && sub.answers.find((x) => x.number === it.number).correct == null);
  need(!missing.length, `Mark #${missing.map((x) => x.number).join(', #')} right or wrong`);
  return commit((d) => {
    results.forEach((r) => {
      const ans = sub.answers.find((x) => x.number === r.number);
      if (ans) ans.correct = !!r.correct;
    });
    const score = items.filter((it) => sub.answers.find((x) => x.number === it.number).correct).reduce((t, it) => t + it.points, 0);
    Object.assign(sub, { score, stars: starsFor(score, sub.maxScore), feedback: feedback?.trim() || null, status: 'GRADED', gradedAt: nowIso() });
    addMissesToRedo(d, sub, items);
    const student = d.students.find((s) => s.id === sub.studentId);
    notify({ userId: student.parentId, audience: 'PARENT', type: 'WORK_GRADED', title: `Vienne checked ${student.firstName}’s ${a.title}`, body: `${score} of ${sub.maxScore} points`, href: '/parent/learning' });
    return submissionDTO(sub);
  });
});

export const returnSubmission = action(async ({ submissionId, feedback }) => {
  requireAdmin();
  need(feedback?.trim(), 'Say what to redo');
  return commit((db) => {
    const sub = db.submissions.find((s) => s.id === submissionId);
    Object.assign(sub, { status: 'RETURNED', feedback, draft: sub.answers?.map(({ number, value }) => ({ number, value })) ?? null });
    const student = db.students.find((s) => s.id === sub.studentId);
    notify({ userId: student.parentId, audience: 'PARENT', type: 'WORK_RETURNED', title: `Vienne returned ${student.firstName}’s work`, body: feedback, href: '/parent/learning' });
    return submissionDTO(sub);
  });
});

/* ── Book results by area for one student (student page, reports) ── */
export function bookResultsFor(db, student, { from, to } = {}) {
  const areas = {};
  db.submissions
    .filter((s) => s.studentId === student.id && s.answers && (!from || s.submittedAt >= from) && (!to || s.submittedAt <= to))
    .forEach((s) => {
      const a = db.assignments.find((x) => x.id === s.assignmentId);
      const items = itemsFor(db, a);
      s.answers.forEach((ans) => {
        if (ans.correct == null) return;
        const item = items.find((it) => it.number === ans.number);
        const area = areaFor(student.grade, { code: item.benchmarkCode });
        areas[area.id] ??= { ...area, right: 0, total: 0 };
        areas[area.id].total += 1;
        if (ans.correct) areas[area.id].right += 1;
      });
    });
  return Object.values(areas).sort((a, b) => a.right / a.total - b.right / b.total);
}
