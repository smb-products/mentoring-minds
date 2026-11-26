/** W5 holdouts: only the child’s own family fills in or reads the work; the key and other families’ photos stay out. */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok, valuesOf } from '../integration/helpers';
import * as assignments from '@/server/assignments';
import * as families from '@/server/families';
import { GET } from '@/app/api/files/[id]/route';

freshDemo();

const open = async (id: string) => (await GET(new Request(`http://localhost/api/files/${id}`), { params: Promise.resolve({ id }) })).status;
const assign = async () => {
  as('u_admin');
  const a = ok(await assignments.createBookAssignment({ bookId: 'book_g5', test: 'T1', from: 10, to: 14, studentIds: ['s_lucia'] }));
  return db.submission.findFirstOrThrow({ where: { assignmentId: a.id } });
};
const sheet = async () => {
  const items = await db.bookItem.findMany({ where: { bookId: 'book_g5', test: 'T1', number: { gte: 10, lte: 14 } }, orderBy: { number: 'asc' } });
  return { items, answers: items.map((i) => ({ number: i.number, value: i.format === 'OPEN' ? null : 'zzz' })) };
};
const photo = (id: string, by: string) =>
  db.fileAsset.create({ data: { id, storageKey: `holdout/${id}.png`, filename: 'page.png', mimeType: 'image/png', sizeBytes: 10, uploadedById: by, uploadedAt: new Date() } });

describe('W5: leaks and the wrong person', () => {
  it('Grace, a PREVIEW parent and a signed-out visitor can’t read, fill in, hand in or grade Lucia’s sheet', async () => {
    const sub = await assign();
    const { answers } = await sheet();
    for (const [who, code] of [['u_grace', 'FORBIDDEN'], ['u_tom', 'NOT_ACTIVE'], [null, 'UNAUTHENTICATED']] as const) {
      as(who);
      fails(await assignments.listForStudent({ studentId: 's_lucia' }), code);
      fails(await assignments.saveAnswerDraft({ submissionId: sub.id, answers }), code);
      fails(await assignments.submitAnswerSheet({ submissionId: sub.id, answers }), code);
      const admin = who ? 'FORBIDDEN' : 'UNAUTHENTICATED';
      fails(await assignments.getAssignment({ assignmentId: sub.assignmentId }), admin);
      fails(await assignments.listAssignments(), admin);
      fails(await assignments.gradingQueue(), admin);
      fails(await assignments.gradeSubmission({ submissionId: sub.id }), admin);
      fails(await assignments.returnSubmission({ submissionId: sub.id, feedback: 'x' }), admin);
      fails(await assignments.createBookAssignment({ bookId: 'book_g5', test: 'T1', studentIds: ['s_lucia'] }), admin);
    }
    expect(await db.submission.findUniqueOrThrow({ where: { id: sub.id } })).toEqual(sub);
  });

  it('refuses blanks, a borrowed photo and a second hand-in; no family response carries the key', async () => {
    const sub = await assign();
    const { items, answers } = await sheet();
    const written = items.filter((i) => i.format === 'OPEN').map((i) => i.number);
    expect(written.length).toBeGreaterThan(0);
    await photo('fa_h_ana', 'u_ana');
    await photo('fa_h_grace', 'u_grace');
    const photos = (fileId: string) => written.map((number) => ({ number, fileId }));
    as('u_ana');
    fails(await assignments.submitAnswerSheet({ submissionId: sub.id, answers: [], photos: photos('fa_h_ana') }), 'INVALID', /Answer every question first/);
    fails(await assignments.submitAnswerSheet({ submissionId: sub.id, answers }), 'INVALID', /Add a photo/);
    fails(await assignments.submitAnswerSheet({ submissionId: sub.id, answers, photos: photos('fa_h_grace') }), 'FORBIDDEN');
    expect(await open('fa_h_grace')).toBe(403);
    expect(await open('fa_arjun_work')).toBe(403);
    expect((await db.submission.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('ASSIGNED');
    expect(await db.redoItem.count({ where: { submissionId: sub.id } })).toBe(0);

    const handed = ok(await assignments.submitAnswerSheet({ submissionId: sub.id, answers, photos: photos('fa_h_ana') }));
    fails(await assignments.submitAnswerSheet({ submissionId: sub.id, answers, photos: photos('fa_h_ana') }), 'INVALID', /already handed in/);
    const seen = [handed, ok(await assignments.listForStudent({ studentId: 's_lucia' })), ok(await families.getFamily({ parentId: 'u_ana' }))];
    expect(valuesOf(seen, 'answer')).toEqual([]);
    expect(valuesOf(seen, 'adminNotes')).toEqual([]);
    for (const [who, status] of [['u_grace', 403], ['u_tom', 403], [null, 401]] as const) {
      as(who);
      expect(await open('fa_h_ana'), String(who)).toBe(status);
    }
  });

  it('an unkeyed test saves and notifies nothing; a child with no work gets an empty list', async () => {
    as('u_admin');
    const counts = () => Promise.all([db.assignment.count(), db.submission.count(), db.notification.count()]);
    const before = await counts();
    fails(await assignments.createBookAssignment({ bookId: 'book_g4', test: 'T2', studentIds: ['s_sofia'] }), 'NO_KEY', /answer key for Test 2/);
    fails(await assignments.createBookAssignment({ bookId: 'book_g5', test: 'T1', studentIds: [] }), 'INVALID');
    expect(await counts()).toEqual(before);
    await db.submission.deleteMany({ where: { studentId: 's_noah' } });
    as('u_grace');
    expect(ok(await assignments.listForStudent({ studentId: 's_noah' }))).toEqual([]);
  });
});
