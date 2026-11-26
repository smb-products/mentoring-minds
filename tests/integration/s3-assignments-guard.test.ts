/**
 * S3: the family's answer-sheet writes check the session before any lookup, and a
 * family can't tell another family's submission id from a missing one.
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as assignments from '@/server/assignments';

freshDemo();

const MISSING = 'sb_does_not_exist';
/** Sofia is Daniel's: a book sheet and a practice link. */
const THEIRS_BOOK = 'sb_sofia_m2';
const THEIRS_PRACTICE = 'sb_sofia_fldoe';

const calls = {
  saveAnswerDraft: (submissionId: string) => assignments.saveAnswerDraft({ submissionId, answers: [{ number: 1, value: 'A' }] }),
  submitAnswerSheet: (submissionId: string) => assignments.submitAnswerSheet({ submissionId, answers: [{ number: 1, value: 'A' }] }),
  markPracticeDone: (submissionId: string) => assignments.markPracticeDone({ submissionId }),
};
const cases = [
  ['saveAnswerDraft', THEIRS_BOOK],
  ['submitAnswerSheet', THEIRS_BOOK],
  ['markPracticeDone', THEIRS_PRACTICE],
] as const;

const snapshot = () => db.submission.findMany({ where: { id: { in: [THEIRS_BOOK, THEIRS_PRACTICE] } }, orderBy: { id: 'asc' } });

describe.each(cases)('%s', (name, theirs) => {
  const call = calls[name];

  it('says to sign in before it looks anything up, for a real id and a missing one alike', async () => {
    const before = await snapshot();
    as(null);
    const real = await call(theirs);
    const missing = await call(MISSING);
    fails(real, 'UNAUTHENTICATED');
    fails(missing, 'UNAUTHENTICATED');
    expect(real).toEqual(missing);
    expect(await snapshot()).toEqual(before);
  });

  it('asks a parent still on the preview for their invite code first', async () => {
    as('u_tom');
    const real = await call(theirs);
    const missing = await call(MISSING);
    fails(real, 'NOT_ACTIVE');
    expect(real).toEqual(missing);
  });

  it('gives a family the same answer for another family’s submission as for a missing one', async () => {
    const before = await snapshot();
    as('u_ana');
    const real = await call(theirs);
    const missing = await call(MISSING);
    fails(real, 'FORBIDDEN');
    expect(real).toEqual(missing);
    expect(await snapshot()).toEqual(before);
  });

  it('tells Vienne a missing id is not found', async () => {
    as('u_admin');
    fails(await call(MISSING), 'NOT_FOUND');
  });
});

describe('a family’s own work still goes through', () => {
  it('saves a draft and marks practice done for their own child', async () => {
    as('u_ana');
    ok(await assignments.saveAnswerDraft({ submissionId: 'sb_mateo_t1', answers: [{ number: 1, value: 'B' }] }));
    expect((await db.submission.findUniqueOrThrow({ where: { id: 'sb_mateo_t1' } })).draft).toEqual([{ number: 1, value: 'B' }]);

    as('u_grace');
    expect(ok(await assignments.markPracticeDone({ submissionId: 'sb_noah_fldoe' }))).toMatchObject({ status: 'GRADED' });
  });

  it('lets Vienne save a draft on any child’s sheet', async () => {
    as('u_admin');
    ok(await assignments.saveAnswerDraft({ submissionId: THEIRS_BOOK, answers: [{ number: 2, value: 'C' }] }));
  });
});
