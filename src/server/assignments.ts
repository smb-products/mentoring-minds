'use server';
/**
 * server/assignments — book homework with the digital answer sheet, plus simple
 * practice links. Book-only: there is no authored question bank.
 *
 *   BOOK      "Test 2, #1–20": the child works in their own book and fills in
 *             numbered answer slots. Checked here against Vienne's key; the key
 *             never reaches a family's device.
 *   PRACTICE  A link or resource. The family taps Done.
 *
 * Contract: tests/contract/mock/server/assignments.js (the frozen mock)
 */
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireActive, requireAdmin, requireStudentAccess } from '@/lib/guards';
import { action, ApiError, found, need, query } from '@/lib/result';
import { id, ids, instant, optText, parse, testKey, text } from '@/lib/validate';
import { bookItemDTO, bookSummary, photoFiles, submissionDTO, submissionDTOs, submissionInclude, testsOf, type Photo, type ScoredAnswer } from '@/lib/dto';
import { itemsFor } from '@/lib/book-results';
import { scoreSheet, starsFor, type KeyItem } from '@/lib/grading';
import { notify, notifyAdmins } from '@/lib/notify';

const MATH = 'sub_math';
const OPEN_FOR_WORK = ['ASSIGNED', 'RETURNED'] as const;
type Tx = Prisma.TransactionClient;

/* ── Vienne: lists and detail ───────────────────────────── */

export const listAssignments = query(async () => {
  await requireAdmin();
  const rows = await db.assignment.findMany({ include: { book: true, submissions: { include: submissionInclude } } });
  const keyCounts = await db.bookItem.groupBy({ by: ['bookId', 'test'], _count: true });
  const files = await photoFiles(rows.flatMap((a) => a.submissions));
  return rows
    .sort((a, b) => (b.dueAt?.toISOString() ?? '').localeCompare(a.dueAt?.toISOString() ?? ''))
    .map(({ submissions: subs, book, ...a }) => {
      const graded = subs.filter((s) => s.status === 'GRADED' && s.maxScore);
      const inRange = a.kind === 'BOOK' ? Math.max(0, (a.bookTo ?? 0) - (a.bookFrom ?? 1) + 1) : 0;
      const keyed = keyCounts.find((k) => k.bookId === a.bookId && k.test === a.bookTest)?._count ?? 0;
      return {
        ...a,
        book: bookSummary(book),
        questionCount: Math.min(inRange, keyed),
        submissions: subs.map((s) => submissionDTO(s, files)),
        counts: {
          assigned: subs.length,
          done: subs.filter((s) => s.status === 'SUBMITTED' || s.status === 'GRADED').length,
          toGrade: subs.filter((s) => s.status === 'SUBMITTED').length,
        },
        averagePercent: graded.length ? Math.round((graded.reduce((n, s) => n + (s.score ?? 0) / s.maxScore!, 0) / graded.length) * 100) : null,
      };
    });
});

/** One assignment with per-question results and a summary by FAST area. */
export const getAssignment = query(async (input: { assignmentId: string }) => {
  await requireAdmin();
  const { assignmentId } = parse(z.object({ assignmentId: id }), input);
  const a = found(await db.assignment.findUnique({ where: { id: assignmentId }, include: { book: true, submissions: { include: submissionInclude } } }), 'Assignment');
  const items = await itemsFor(a);
  const finished = a.submissions.filter((s) => s.answers);
  const grade = a.book?.grade ?? 0;
  const perItem = items.map((it) => {
    const results = finished.map((s) => (s.answers as ScoredAnswer[]).find((x) => x.number === it.number)?.correct);
    return {
      ...bookItemDTO(it, { grade, withAnswer: true }),
      right: results.filter((x) => x === true).length,
      wrong: results.filter((x) => x === false).length,
      pending: results.filter((x) => x == null).length,
    };
  });
  const areas = new Map<string, { id: string; name: string; fullName: string; right: number; total: number }>();
  for (const it of perItem) {
    const row = areas.get(it.area.id) ?? { ...it.area, right: 0, total: 0 };
    row.right += it.right;
    row.total += it.right + it.wrong;
    areas.set(it.area.id, row);
  }
  const { submissions, book, ...rest } = a;
  return { ...rest, book: bookSummary(book), items: perItem, areas: [...areas.values()], submissions: await submissionDTOs(submissions) };
});

async function assignees(studentIds: string[]) {
  const unique = [...new Set(studentIds)];
  const students = await db.student.findMany({ where: { id: { in: unique }, status: { not: 'ARCHIVED' } } });
  need(students.length === unique.length, 'One of those students wasn’t found');
  return students;
}

/** Assign book questions. `from`/`to` default to the whole test; every question needs its key. */
export const createBookAssignment = action(
  async (input: { bookId: string; test: string; from?: number; to?: number; dueAt?: string | null; instructions?: string; studentIds: string[] }) => {
    await requireAdmin();
    const v = parse(
      z.object({
        bookId: id,
        test: testKey,
        from: z.number().int().min(1).default(1),
        to: z.number().int().min(1).optional(),
        dueAt: instant.nullish(),
        instructions: optText(1000),
        studentIds: ids.min(1, 'Choose at least one student'),
      }),
      input,
    );
    const book = found(await db.book.findUnique({ where: { id: v.bookId } }), 'Book');
    const t = found(testsOf(book).find((x) => x.key === v.test), 'Test');
    const last = Math.min(v.to ?? t.count, t.count);
    need(v.from <= last, 'The question range is backwards');
    const keyed = await db.bookItem.count({ where: { bookId: book.id, test: t.key, number: { gte: v.from, lte: last } } });
    if (keyed < last - v.from + 1) throw new ApiError('NO_KEY', `Add the answer key for ${t.name} first (Content → Book).`);
    const students = await assignees(v.studentIds);
    const wrong = students.filter((s) => s.grade !== book.grade);
    need(!wrong.length, `${wrong.map((s) => s.firstName).join(', ')} isn’t in grade ${book.grade}`);

    const range = v.from === 1 && last === t.count ? '' : `, #${v.from}–${last}`;
    const a = await db.assignment.create({
      data: {
        title: `${t.name}${range}`,
        instructions: v.instructions || 'Do these in your book, then fill in your answers here.',
        kind: 'BOOK',
        subjectId: MATH,
        bookId: book.id,
        bookTest: t.key,
        bookFrom: v.from,
        bookTo: last,
        dueAt: v.dueAt ?? null,
        submissions: { create: students.map((s) => ({ studentId: s.id })) },
      },
    });
    await Promise.all(students.map((s) => notify({ userId: s.parentId, audience: 'PARENT', type: 'ASSIGNMENT_GIVEN', title: `New book homework for ${s.firstName}`, body: a.title, href: '/parent/learning' })));
    return a;
  },
);

export const createPracticeAssignment = action(async (input: { title: string; instructions?: string; resourceId?: string | null; dueAt?: string | null; studentIds: string[] }) => {
  await requireAdmin();
  const v = parse(
    z.object({ title: text(120).min(1, 'Give it a title'), instructions: optText(1000), resourceId: id.nullish(), dueAt: instant.nullish(), studentIds: ids.min(1, 'Choose at least one student') }),
    input,
  );
  if (v.resourceId) found(await db.resource.findFirst({ where: { id: v.resourceId, deletedAt: null } }), 'Resource');
  const students = await assignees(v.studentIds);
  const a = await db.assignment.create({
    data: { title: v.title, instructions: v.instructions, kind: 'PRACTICE', subjectId: MATH, resourceId: v.resourceId ?? null, dueAt: v.dueAt ?? null, submissions: { create: students.map((s) => ({ studentId: s.id })) } },
  });
  await Promise.all(students.map((s) => notify({ userId: s.parentId, audience: 'PARENT', type: 'ASSIGNMENT_GIVEN', title: `New practice for ${s.firstName}`, body: a.title, href: '/parent/learning' })));
  return a;
});

/* ── Families: the answer sheet ─────────────────────────── */

/**
 * A student's work. Book questions go out WITHOUT their answers; after checking,
 * each slot's result is in `answers[].correct`, so the child sees what to redo.
 */
export const listForStudent = query(async (input: { studentId: string }) => {
  const { studentId } = parse(z.object({ studentId: id }), input);
  await requireStudentAccess(studentId);
  const student = found(await db.student.findUnique({ where: { id: studentId } }), 'Student');
  const subs = await db.submission.findMany({ where: { studentId }, include: { ...submissionInclude, assignment: { include: { book: true, resource: true } } } });
  const files = await photoFiles(subs);
  const out = await Promise.all(
    subs.map(async (s) => {
      const { book, resource, ...a } = s.assignment;
      const slots = (await itemsFor(a)).map((it) => bookItemDTO(it, { grade: student.grade, withAnswer: false }));
      return { ...submissionDTO(s, files), assignment: { ...a, book: bookSummary(book), resource: resource && !resource.deletedAt ? (({ deletedAt: _bin, ...rest }) => rest)(resource) : null, slots } };
    }),
  );
  return out.sort((a, b) => (a.assignment.dueAt?.toISOString() ?? '').localeCompare(b.assignment.dueAt?.toISOString() ?? ''));
});

type Caller = { id: string; role: string };

/** A family looks only among its own children's work, so nothing says which other ids exist. */
function workOf(user: Caller, submissionId: string): Prisma.SubmissionWhereInput {
  return user.role === 'ADMIN' ? { id: submissionId } : { id: submissionId, student: { parentId: user.id } };
}

/** Another family's submission and a missing one get the same answer. */
function ownWork<T>(user: Caller, sub: T | null): T {
  if (user.role === 'ADMIN') return found(sub, 'Assignment');
  if (!sub) throw new ApiError('FORBIDDEN', 'You don’t have access to this student.');
  return sub;
}

const answerList = z.array(z.object({ number: z.number().int().min(1).max(200), value: z.string().max(40).nullable() })).max(200);

/** Progress is saved as the child goes, so closing the app loses nothing. */
export const saveAnswerDraft = action(async (input: { submissionId: string; answers: { number: number; value: string | null }[] }) => {
  const user = await requireActive();
  const v = parse(z.object({ submissionId: id, answers: answerList }), input);
  const sub = ownWork(user, await db.submission.findFirst({ where: workOf(user, v.submissionId) }));
  const n = await db.submission.updateMany({ where: { id: sub.id, status: { in: [...OPEN_FOR_WORK] } }, data: { draft: v.answers } });
  need(n.count, 'This was already handed in');
  return true;
});

/** Photos must be finished uploads by this family (or Vienne). */
async function checkPhotos(photos: Photo[], userId: string, numbers: number[]) {
  if (!photos.length) return [];
  const kept = photos.filter((p) => numbers.includes(p.number));
  const files = await db.fileAsset.findMany({ where: { id: { in: kept.map((p) => p.fileId) } } });
  for (const p of kept) {
    const f = files.find((x) => x.id === p.fileId);
    need(f?.uploadedAt && f.mimeType.startsWith('image/'), `The photo for #${p.number} didn’t upload. Add it again.`);
    need(f.uploadedById === userId, `The photo for #${p.number} didn’t upload. Add it again.`, 'FORBIDDEN');
  }
  return kept;
}

async function addMissesToRedo(tx: Tx, studentId: string, submissionId: string, items: { id: string; number: number }[], scored: ScoredAnswer[]) {
  for (const s of scored.filter((x) => x.correct === false)) {
    const item = items.find((it) => it.number === s.number);
    if (!item) continue;
    const open = await tx.redoItem.findFirst({ where: { studentId, bookItemId: item.id, clearedAt: null } });
    if (!open) await tx.redoItem.create({ data: { studentId, bookItemId: item.id, source: 'ANSWER_SHEET', submissionId } });
  }
}

/**
 * Hand in an answer sheet. Checked on the server; misses go on the redo list.
 * Waits for Vienne only when there are written (OPEN) answers to look at.
 */
export const submitAnswerSheet = action(async (input: { submissionId: string; answers?: { number: number; value: string | null }[]; photos?: Photo[] }) => {
  const user = await requireActive();
  const v = parse(z.object({ submissionId: id, answers: answerList.default([]), photos: z.array(z.object({ number: z.number().int(), fileId: id })).max(200).default([]) }), input);
  const sub = ownWork(user, await db.submission.findFirst({ where: workOf(user, v.submissionId), include: { assignment: true, student: true } }));
  need((OPEN_FOR_WORK as readonly string[]).includes(sub.status), 'This was already handed in');
  need(sub.assignment.kind === 'BOOK', 'This isn’t a book assignment');
  const items = await itemsFor(sub.assignment);
  const blank = items.filter((it) => it.format !== 'OPEN' && !String(v.answers.find((a) => a.number === it.number)?.value ?? '').trim());
  need(!blank.length, `Answer every question first. Still empty: #${blank.map((x) => x.number).join(', #')}`);
  const openNumbers = items.filter((it) => it.format === 'OPEN').map((it) => it.number);
  const noPhoto = openNumbers.filter((n) => !v.photos.some((p) => p.number === n && p.fileId));
  need(!noPhoto.length, `Add a photo of your work for #${noPhoto.join(', #')}`);
  const photos = await checkPhotos(v.photos, user.id, openNumbers);

  const r = scoreSheet(items as KeyItem[], v.answers);
  const now = new Date();
  const updated = await db.$transaction(async (tx) => {
    // Guarded update: a double tap can't hand the same sheet in twice.
    const claimed = await tx.submission.updateMany({
      where: { id: sub.id, status: { in: [...OPEN_FOR_WORK] } },
      data: {
        answers: r.scored,
        draft: Prisma.DbNull,
        photos,
        autoScore: r.autoScore,
        maxScore: r.maxScore,
        score: r.waiting ? null : r.autoScore,
        stars: r.stars,
        status: r.waiting ? 'SUBMITTED' : 'GRADED',
        submittedById: user.id,
        submittedAt: now,
        gradedAt: r.waiting ? null : now,
      },
    });
    need(claimed.count, 'This was already handed in');
    await addMissesToRedo(tx, sub.studentId, sub.id, items, r.scored);
    return tx.submission.findUniqueOrThrow({ where: { id: sub.id }, include: submissionInclude });
  });
  const right = r.scored.filter((x) => x.correct).length;
  const checked = r.scored.filter((x) => x.correct !== null).length;
  const written = items.length - checked;
  await notifyAdmins({
    type: 'SUBMISSION_RECEIVED',
    title: `${sub.student.firstName} finished ${sub.assignment.title}`,
    body: `${right} of ${checked} right.${r.waiting ? ` ${written} written ${written === 1 ? 'answer' : 'answers'} to check.` : ''}`,
    href: `/admin/assignments/${sub.assignmentId}`,
  });
  const [dto] = await submissionDTOs([updated]);
  return { ...dto, slots: items.map((it) => bookItemDTO(it, { grade: sub.student.grade, withAnswer: false })) };
});

/** PRACTICE: the family taps Done. */
export const markPracticeDone = action(async (input: { submissionId: string }) => {
  const user = await requireActive();
  const { submissionId } = parse(z.object({ submissionId: id }), input);
  const sub = ownWork(user, await db.submission.findFirst({ where: workOf(user, submissionId), include: { assignment: true } }));
  need(sub.assignment.kind === 'PRACTICE', 'This one has an answer sheet');
  const now = new Date();
  const n = await db.submission.updateMany({
    where: { id: sub.id, status: { in: [...OPEN_FOR_WORK] } },
    data: { status: 'GRADED', score: 1, maxScore: 1, stars: 3, submittedById: user.id, submittedAt: now, gradedAt: now },
  });
  need(n.count, 'This is already done');
  const [dto] = await submissionDTOs([await db.submission.findUniqueOrThrow({ where: { id: sub.id }, include: submissionInclude })]);
  return dto;
});

/* ── Vienne: checking written answers ───────────────────── */

export const gradingQueue = query(async () => {
  await requireAdmin();
  return submissionDTOs(await db.submission.findMany({ where: { status: 'SUBMITTED' }, include: submissionInclude, orderBy: { submittedAt: 'asc' } }));
});

/** Vienne marks the written answers (and may override any auto-marked one). */
export const gradeSubmission = action(async (input: { submissionId: string; results?: { number: number; correct: boolean }[]; feedback?: string | null }) => {
  await requireAdmin();
  const v = parse(z.object({ submissionId: id, results: z.array(z.object({ number: z.number().int(), correct: z.boolean() })).max(200).default([]), feedback: optText(2000) }), input);
  const sub = found(await db.submission.findUnique({ where: { id: v.submissionId }, include: { assignment: true, student: true } }), 'Assignment');
  need(sub.answers && (sub.status === 'SUBMITTED' || sub.status === 'GRADED'), 'Nothing to grade yet');
  const items = await itemsFor(sub.assignment);
  const answers = (sub.answers as ScoredAnswer[]).map((a) => {
    const r = v.results.find((x) => x.number === a.number);
    return r ? { ...a, correct: r.correct } : a;
  });
  const missing = answers.filter((a) => a.correct === null);
  need(!missing.length, `Mark #${missing.map((x) => x.number).join(', #')} right or wrong`);
  const score = items.reduce((t, it) => t + (answers.find((a) => a.number === it.number)?.correct ? it.points : 0), 0);
  const updated = await db.$transaction(async (tx) => {
    await tx.submission.update({ where: { id: sub.id }, data: { answers, score, stars: starsFor(score, sub.maxScore ?? 0), feedback: v.feedback, status: 'GRADED', gradedAt: new Date() } });
    await addMissesToRedo(tx, sub.studentId, sub.id, items, answers);
    return tx.submission.findUniqueOrThrow({ where: { id: sub.id }, include: submissionInclude });
  });
  await notify({ userId: sub.student.parentId, audience: 'PARENT', type: 'WORK_GRADED', title: `Vienne checked ${sub.student.firstName}’s ${sub.assignment.title}`, body: `${score} of ${sub.maxScore} points`, href: '/parent/learning' });
  const [dto] = await submissionDTOs([updated]);
  return dto;
});

/** Sends work back to redo, keeping the child's answers as the starting point. */
export const returnSubmission = action(async (input: { submissionId: string; feedback: string }) => {
  await requireAdmin();
  const v = parse(z.object({ submissionId: id, feedback: z.string().trim().min(1, 'Say what to redo').max(2000) }), input);
  const sub = found(await db.submission.findUnique({ where: { id: v.submissionId }, include: { student: true } }), 'Assignment');
  need(sub.status === 'SUBMITTED' || sub.status === 'GRADED', 'This hasn’t been handed in yet');
  const draft = (sub.answers as ScoredAnswer[] | null)?.map(({ number, value }) => ({ number, value })) ?? null;
  const updated = await db.submission.update({
    where: { id: sub.id },
    data: { status: 'RETURNED', feedback: v.feedback, draft: draft ?? Prisma.DbNull },
    include: submissionInclude,
  });
  await notify({ userId: sub.student.parentId, audience: 'PARENT', type: 'WORK_RETURNED', title: `Vienne returned ${sub.student.firstName}’s work`, body: v.feedback, href: '/parent/learning' });
  const [dto] = await submissionDTOs([updated]);
  return dto;
});
