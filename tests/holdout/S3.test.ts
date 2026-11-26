/**
 * S3 holdout: nothing a family sends to the answer-sheet writes tells them whether
 * another family's work exists, what kind it is or whether it was handed in.
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo } from '../integration/helpers';
import * as assignments from '@/server/assignments';

freshDemo();

const MISSING = 'sb_no_such_work';
const writes = {
  saveAnswerDraft: (submissionId: string) => assignments.saveAnswerDraft({ submissionId, answers: [{ number: 1, value: 'D' }] }),
  submitAnswerSheet: (submissionId: string) => assignments.submitAnswerSheet({ submissionId, answers: [{ number: 1, value: 'D' }] }),
  markPracticeDone: (submissionId: string) => assignments.markPracticeDone({ submissionId }),
};

const everyRow = () => db.submission.findMany({ orderBy: { id: 'asc' } });

describe('S3: another family’s work', () => {
  it('every one of Ana’s and Daniel’s sheets, any kind or status, answers Grace like a missing id and stays unchanged', async () => {
    const theirs = await db.submission.findMany({
      where: { student: { parentId: { in: ['u_ana', 'u_daniel'] } } },
      include: { assignment: { select: { kind: true } } },
    });
    // The demo covers both kinds, and work that is open as well as handed in.
    expect(new Set(theirs.map((s) => s.assignment.kind))).toEqual(new Set(['BOOK', 'PRACTICE']));
    expect(theirs.some((s) => s.status === 'ASSIGNED')).toBe(true);
    expect(theirs.some((s) => s.status === 'GRADED' || s.status === 'SUBMITTED')).toBe(true);

    const before = await everyRow();
    const alerts = await db.notification.count();
    as('u_grace');
    for (const [name, call] of Object.entries(writes)) {
      const missing = await call(MISSING);
      fails(missing, 'FORBIDDEN');
      for (const s of theirs) expect(await call(s.id), `${name} ${s.id}`).toEqual(missing);
    }
    expect(await everyRow()).toEqual(before);
    expect(await db.notification.count()).toBe(alerts);
  });

  it('signed out and PREVIEW callers are told that first, even with unusable input', async () => {
    const before = await everyRow();
    for (const [who, code] of [[null, 'UNAUTHENTICATED'], ['u_tom', 'NOT_ACTIVE']] as const) {
      as(who);
      fails(await assignments.saveAnswerDraft({ submissionId: '', answers: [] }), code);
      fails(await assignments.submitAnswerSheet({ submissionId: '' }), code);
      fails(await assignments.markPracticeDone({ submissionId: '' }), code);
    }
    expect(await everyRow()).toEqual(before);
  });

  it('wrong input from an active parent is refused and saves nothing', async () => {
    const before = await everyRow();
    as('u_ana');
    expect((await assignments.saveAnswerDraft({ submissionId: 'sb_mateo_t1', answers: [{ number: 0, value: 'A' }] })).ok).toBe(false);
    expect((await assignments.submitAnswerSheet({ submissionId: '' })).ok).toBe(false);
    expect((await assignments.markPracticeDone({ submissionId: '' })).ok).toBe(false);
    expect(await everyRow()).toEqual(before);
  });
});
