/**
 * server/books — the Florida Test Prep F.A.S.T. book per grade, Vienne's answer
 * key, and each student's redo list. The app stores where a question is, what it
 * tests and its answer. It never stores the question text or page images.
 */
import { action, commit, getDb, need, newId, nowIso, requireAdmin, requireStudentAccess, requireUser } from '../core';
import { bookItemDTO, bookSummary } from '../dto';
import { codesForGrade } from '../best';

const FORMATS = ['MC', 'MULTI', 'NUMERIC', 'OPEN'];

/** Books with how much of each test's key is entered. */
export async function listBooks() {
  requireUser();
  const db = getDb();
  return [...db.books]
    .sort((a, b) => a.grade - b.grade)
    .map((b) => ({
      ...bookSummary(b),
      tests: b.tests.map((t) => ({ ...t, keyed: db.bookItems.filter((i) => i.bookId === b.id && i.test === t.key).length })),
      studentsWithBook: db.students.filter((s) => s.grade === b.grade && s.status === 'ACTIVE' && s.hasBookAt).length,
      studentsInGrade: db.students.filter((s) => s.grade === b.grade && s.status === 'ACTIVE').length,
    }));
}

/** One test's answer key (admin only). */
export async function getAnswerKey({ bookId, test }) {
  requireAdmin();
  const db = getDb();
  const book = db.books.find((b) => b.id === bookId);
  need(book, 'Book not found');
  const t = book.tests.find((x) => x.key === test);
  need(t, 'Test not found');
  const items = db.bookItems.filter((i) => i.bookId === bookId && i.test === test).sort((a, b) => a.number - b.number);
  return { book: bookSummary(book), test: t, items: items.map((i) => bookItemDTO(i, { grade: book.grade })), codes: codesForGrade(book.grade) };
}

/**
 * Save one test (or one page of it). rows: [{ number, format, answer, choiceCount?, benchmarkCode?, points? }]
 * Validates that answers fit their format. Existing rows for those numbers are replaced.
 */
export const saveAnswerKey = action(async ({ bookId, test, rows, source = 'TYPED', aiDraftId = null }) => {
  requireAdmin();
  const db = getDb();
  const book = db.books.find((b) => b.id === bookId);
  need(book, 'Book not found');
  const t = book.tests.find((x) => x.key === test);
  need(t, 'Test not found');
  const codes = codesForGrade(book.grade);
  rows.forEach((r) => {
    need(Number.isInteger(r.number) && r.number >= 1 && r.number <= t.count, `#${r.number} isn’t in ${t.name} (1–${t.count})`);
    need(FORMATS.includes(r.format), `#${r.number}: choose a format`);
    if (r.format === 'MC') need(/^[A-D]$/i.test(r.answer || ''), `#${r.number}: the answer should be one letter, A to D`);
    if (r.format === 'MULTI') need(/^[A-F](\s*,\s*[A-F])+$/i.test(r.answer || ''), `#${r.number}: list two or more letters, like A, C`);
    if (r.format === 'NUMERIC') need(/^-?\d+(\.\d+)?$|^-?\d+\/\d+$|^-?\d+ \d+\/\d+$/.test((r.answer || '').trim()), `#${r.number}: the answer should be a number or fraction, like 12, 0.5 or 3/4`);
    need(!r.benchmarkCode || codes.length === 0 || codes.includes(r.benchmarkCode), `#${r.number}: that standard isn’t a grade ${book.grade} standard`);
  });
  const numbers = rows.map((r) => r.number);
  need(new Set(numbers).size === numbers.length, 'A question number appears twice');
  return commit((d) => {
    d.bookItems = d.bookItems.filter((i) => !(i.bookId === bookId && i.test === test && numbers.includes(i.number)));
    rows.forEach((r) =>
      d.bookItems.push({
        id: `bi_${bookId.slice(5)}_${test}_${r.number}_${newId('x').slice(2, 6)}`, bookId, test, number: r.number, format: r.format,
        choiceCount: r.format === 'MC' ? 4 : r.format === 'MULTI' ? r.choiceCount || 5 : null,
        answer: r.format === 'OPEN' ? null : r.format === 'MULTI' ? r.answer.toUpperCase().replace(/\s/g, '') : r.answer.trim().toUpperCase(),
        benchmarkCode: r.benchmarkCode || null, points: r.points || (r.format === 'OPEN' ? 2 : 1), source,
      }),
    );
    if (aiDraftId) {
      const draft = d.aiDrafts.find((x) => x.id === aiDraftId);
      if (draft) Object.assign(draft, { status: 'ACCEPTED', decidedAt: nowIso() });
    }
    return d.bookItems.filter((i) => i.bookId === bookId && i.test === test).length;
  });
});

/** Book for a grade (parents see it in the "Get the book" step). */
export async function bookForGrade({ grade }) {
  requireUser();
  return bookSummary(getDb().books.find((b) => b.grade === grade)) ?? null;
}

/** Parent (or Vienne) confirms the family has the book. */
export const setHasBook = action(async ({ studentId, hasBook = true }) => {
  requireStudentAccess(studentId);
  return commit((db) => {
    const s = db.students.find((x) => x.id === studentId);
    s.hasBookAt = hasBook ? nowIso() : null;
    return { studentId, hasBookAt: s.hasBookAt };
  });
});

/* ── Redo list ─────────────────────────────────────────────── */
export async function listRedo({ studentId }) {
  requireStudentAccess(studentId);
  const db = getDb();
  const student = db.students.find((s) => s.id === studentId);
  return db.redoItems
    .filter((r) => r.studentId === studentId && !r.clearedAt)
    .map((r) => {
      const item = db.bookItems.find((i) => i.id === r.bookItemId);
      const book = item && db.books.find((b) => b.id === item.bookId);
      return item && { ...r, item: bookItemDTO(item, { grade: student.grade, withAnswer: false }), testName: book.tests.find((t) => t.key === item.test)?.name };
    })
    .filter(Boolean)
    .sort((a, b) => a.item.test.localeCompare(b.item.test) || a.item.number - b.item.number);
}

export const clearRedo = action(async ({ redoIds }) => {
  requireAdmin();
  return commit((db) => db.redoItems.forEach((r) => redoIds.includes(r.id) && (r.clearedAt = nowIso())));
});

/** Vienne adds book questions to a redo list by test and numbers, e.g. "T2" [6, 14]. */
export const addRedo = action(async ({ studentId, test, numbers }) => {
  requireAdmin();
  const db = getDb();
  const student = db.students.find((s) => s.id === studentId);
  const book = db.books.find((b) => b.grade === student.grade);
  need(book, `There’s no book set up for grade ${student.grade}`);
  const items = db.bookItems.filter((i) => i.bookId === book.id && i.test === test && numbers.includes(i.number));
  need(items.length === numbers.length, 'Some of those questions aren’t in the answer key yet');
  return commit((d) => {
    items.forEach((item) => {
      if (d.redoItems.some((r) => r.studentId === studentId && r.bookItemId === item.id && !r.clearedAt)) return;
      d.redoItems.push({ id: newId('redo'), studentId, bookItemId: item.id, source: 'SESSION', submissionId: null, createdAt: nowIso(), clearedAt: null });
    });
    return items.length;
  });
});
