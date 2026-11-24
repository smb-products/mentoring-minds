/**
 * Book homework end to end: assign → the child fills in the answer sheet → checked
 * on the server → misses on the redo list → Vienne checks written answers.
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, localTarget, ok, valuesOf } from './helpers';
import * as assignments from '@/server/assignments';
import * as content from '@/server/content';
import { PUT as uploadRoute } from '@/app/api/files/upload/[id]/route';

freshDemo();

const JPEG = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'));

/** What the phone does: reserve, PUT the bytes, confirm. */
async function uploadPhoto(bytes = JPEG, mimeType = 'image/jpeg') {
  const { file, upload: u } = ok(await content.createUpload({ filename: 'work.jpg', mimeType, sizeBytes: bytes.byteLength }));
  const upload = localTarget(u);
  const url = new URL(upload.url, 'http://localhost');
  const res = await uploadRoute(new Request(url, { method: 'PUT', headers: upload.headers, body: bytes as unknown as BodyInit }), { params: Promise.resolve({ id: file.id }) } as never);
  expect(res.status).toBe(204);
  return ok(await content.finishUpload({ fileId: file.id }));
}

/** The right answer, written the way a child might (fractions as decimals, letters in any order). */
const rightAnswer = (it: { format: string; answer: string | null }) => {
  if (it.format === 'NUMERIC' && it.answer === '3/4') return '0.75';
  if (it.format === 'MULTI') return it.answer!.split(',').reverse().join(', ').toLowerCase();
  return it.answer;
};

describe('assigning', () => {
  it('needs the whole range keyed, and students in the book’s grade', async () => {
    as('u_admin');
    fails(await assignments.createBookAssignment({ bookId: 'book_g3', test: 'T4', studentIds: ['s_mateo'] }), 'NO_KEY');
    fails(await assignments.createBookAssignment({ bookId: 'book_g3', test: 'T2', studentIds: ['s_lucia'] }), 'INVALID', /isn’t in grade 3/);
    fails(await assignments.createBookAssignment({ bookId: 'book_g3', test: 'T2', from: 9, to: 4, studentIds: ['s_mateo'] }), 'INVALID', /backwards/);
    const a = ok(await assignments.createBookAssignment({ bookId: 'book_g3', test: 'T2', from: 1, to: 13, studentIds: ['s_mateo', 's_jordan'], dueAt: new Date(Date.now() + 5 * 86400000).toISOString() }));
    expect(a.title).toBe('Test 2, #1–13');
    expect(await db.submission.count({ where: { assignmentId: a.id } })).toBe(2);
    expect(await db.notification.count({ where: { userId: 'u_ana', type: 'ASSIGNMENT_GIVEN' } })).toBeGreaterThan(0);
  });
});

describe('the answer sheet', () => {
  it('goes out with numbered slots and no answers, and saves a draft as the child goes', async () => {
    as('u_ana');
    const work = ok(await assignments.listForStudent({ studentId: 's_mateo' }));
    const t2 = work.find((w) => w.assignment.title === 'Test 2, #1–13')!;
    expect(t2.assignment.slots.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(valuesOf(work, 'answer')).toEqual([]);
    ok(await assignments.saveAnswerDraft({ submissionId: t2.id, answers: [{ number: 1, value: 'B' }] }));
    expect((await db.submission.findUniqueOrThrow({ where: { id: t2.id } })).draft).toEqual([{ number: 1, value: 'B' }]);
  });

  it('is checked on the server: equivalent answers count, misses go on the redo list', async () => {
    as('u_ana');
    const sub = await db.submission.findFirstOrThrow({ where: { studentId: 's_mateo', assignment: { title: 'Test 2, #1–13' } }, include: { assignment: true } });
    const key = await db.bookItem.findMany({ where: { bookId: 'book_g3', test: 'T2', number: { lte: 13 } }, orderBy: { number: 'asc' } });
    const open = key.filter((k) => k.format === 'OPEN');
    expect(open.map((k) => k.number)).toEqual([13]); // one written answer, so the photo path runs
    const auto = key.filter((k) => k.format !== 'OPEN');
    const [miss, ...rest] = auto;
    const answers = [{ number: miss.number, value: miss.format === 'NUMERIC' ? '999' : miss.answer === 'A' ? 'B' : 'A' }, ...rest.map((k) => ({ number: k.number, value: rightAnswer(k) }))];

    // Blank answers and missing photos are caught first, in plain words.
    fails(await assignments.submitAnswerSheet({ submissionId: sub.id, answers: answers.slice(1) }), 'INVALID', /Still empty: #/);
    if (open.length) fails(await assignments.submitAnswerSheet({ submissionId: sub.id, answers }), 'INVALID', /Add a photo/);
    const photos = await Promise.all(open.map(async (k) => ({ number: k.number, fileId: (await uploadPhoto()).id })));

    const redoBefore = await db.redoItem.count({ where: { studentId: 's_mateo', clearedAt: null } });
    const r = ok(await assignments.submitAnswerSheet({ submissionId: sub.id, answers, photos }));
    expect(r.status).toBe(open.length ? 'SUBMITTED' : 'GRADED');
    expect(r.autoScore).toBe(rest.reduce((t, k) => t + k.points, 0));
    expect(r.maxScore).toBe(key.reduce((t, k) => t + k.points, 0));
    expect(r.answers!.find((a) => a.number === miss.number)?.correct).toBe(false);
    expect(r.answers!.filter((a) => a.correct === true)).toHaveLength(rest.length);
    expect(valuesOf(r, 'answer')).toEqual([]);
    expect(r.photos.every((p) => p.file?.uploadedAt)).toBe(true);
    expect(await db.redoItem.count({ where: { studentId: 's_mateo', clearedAt: null } })).toBe(redoBefore + 1);
    expect((await db.submission.findUniqueOrThrow({ where: { id: sub.id } })).draft).toBeNull();

    // A second tap can't hand it in again.
    fails(await assignments.submitAnswerSheet({ submissionId: sub.id, answers, photos }), 'INVALID', /already handed in/);
    fails(await assignments.saveAnswerDraft({ submissionId: sub.id, answers }), 'INVALID', /already handed in/);
  });

  it('rejects a photo that another family uploaded', async () => {
    as('u_daniel');
    const theirs = await uploadPhoto();
    as('u_ana');
    const sub = await db.submission.findFirstOrThrow({ where: { id: 'sb_mateo_t1' } });
    const key = await db.bookItem.findMany({ where: { bookId: 'book_g3', test: 'T1' }, orderBy: { number: 'asc' } });
    const open = key.filter((k) => k.format === 'OPEN');
    if (!open.length) return;
    const answers = key.filter((k) => k.format !== 'OPEN').map((k) => ({ number: k.number, value: k.answer }));
    fails(await assignments.submitAnswerSheet({ submissionId: sub.id, answers, photos: open.map((k) => ({ number: k.number, fileId: theirs.id })) }), 'FORBIDDEN');
  });
});

describe('Vienne checks written answers', () => {
  it('the queue, marking every written answer, stars, and the family is told', async () => {
    as('u_admin');
    const queue = ok(await assignments.gradingQueue());
    expect(queue.map((s) => s.id)).toEqual(expect.arrayContaining(['sb_lucia_t1', 'sb_arjun_t1']));
    const sub = await db.submission.findUniqueOrThrow({ where: { id: 'sb_lucia_t1' } });
    const pending = (sub.answers as { number: number; correct: boolean | null }[]).filter((a) => a.correct === null);
    expect(pending.length).toBeGreaterThan(0);
    fails(await assignments.gradeSubmission({ submissionId: sub.id, results: [] }), 'INVALID', /right or wrong/);
    const graded = ok(await assignments.gradeSubmission({ submissionId: sub.id, results: pending.map((p) => ({ number: p.number, correct: true })), feedback: 'Lovely work' }));
    expect(graded).toMatchObject({ status: 'GRADED', feedback: 'Lovely work' });
    expect(graded.score).toBeGreaterThan(sub.autoScore!);
    expect([1, 2, 3]).toContain(graded.stars);
    expect(await db.notification.count({ where: { userId: 'u_ana', type: 'WORK_GRADED' } })).toBeGreaterThan(0);
  });

  it('returning work keeps the child’s answers as a starting point', async () => {
    as('u_admin');
    fails(await assignments.returnSubmission({ submissionId: 'sb_chidi_t1', feedback: '' }), 'INVALID', /what to redo/);
    const r = ok(await assignments.returnSubmission({ submissionId: 'sb_chidi_t1', feedback: 'Redo #19 with a drawing' }));
    expect(r.status).toBe('RETURNED');
    const row = await db.submission.findUniqueOrThrow({ where: { id: 'sb_chidi_t1' } });
    expect((row.draft as unknown[]).length).toBe((row.answers as unknown[]).length);
  });

  it('per-question results and the summary by FAST area', async () => {
    as('u_admin');
    const a = ok(await assignments.getAssignment({ assignmentId: 'as_g5_t1' }));
    expect(a.items.length).toBeGreaterThan(0);
    expect(a.items.every((i) => 'answer' in i && typeof i.right === 'number' && i.area.id)).toBe(true);
    expect(a.areas.reduce((t, x) => t + x.total, 0)).toBe(a.items.reduce((t, i) => t + i.right + i.wrong, 0));
    const list = ok(await assignments.listAssignments());
    const row = list.find((x) => x.id === 'as_g5_t1')!;
    expect(row.counts.assigned).toBe(row.submissions.length);
  });
});

describe('practice', () => {
  it('the family taps Done; book work can’t be marked done that way', async () => {
    as('u_ana');
    const r = ok(await assignments.markPracticeDone({ submissionId: 'sb_lucia_fldoe' }));
    expect(r).toMatchObject({ status: 'GRADED', stars: 3 });
    fails(await assignments.markPracticeDone({ submissionId: 'sb_lucia_fldoe' }), 'INVALID', /already done/);
    fails(await assignments.markPracticeDone({ submissionId: 'sb_lucia_t1b' }), 'INVALID', /answer sheet/);
  });
});
