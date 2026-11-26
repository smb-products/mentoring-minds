/** S4 holdouts: report ids can’t be probed by the other parent, a preview or paused parent, or anyone signed out. */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from '../integration/helpers';
import * as reports from '@/server/reports';

freshDemo();

const SECRET = 'HOLDOUT-S4-SUMMARY';

async function report(studentId: string, status: 'DRAFT' | 'PUBLISHED') {
  return db.progressReport.create({
    data: { studentId, status, publishedAt: status === 'PUBLISHED' ? new Date() : null, summary: SECRET, periodStart: new Date('2026-09-01T00:00:00Z'), periodEnd: new Date('2026-10-01T00:00:00Z') },
  });
}

describe('S4 holdouts', () => {
  it('between Ana and Grace, the other’s draft, published and made-up report ids get one identical answer; their own draft is NOT_FOUND', async () => {
    const pairs = [['u_ana', 's_noah', 's_mateo'], ['u_grace', 's_mateo', 's_noah']] as const;
    const everyAnswer = new Set<string>();
    for (const [who, theirKid, ownKid] of pairs) {
      const ids = [(await report(theirKid, 'DRAFT')).id, (await report(theirKid, 'PUBLISHED')).id, 'pr_does_not_exist', "' OR 1=1 --"];
      const own = await report(ownKid, 'DRAFT');
      as(who);
      for (const reportId of ids) everyAnswer.add(JSON.stringify(await reports.getReport({ reportId })));
      const r = await reports.getReport({ reportId: own.id });
      fails(r, 'NOT_FOUND');
      expect(JSON.stringify(r)).not.toContain(SECRET);
    }
    expect([...everyAnswer]).toHaveLength(1);
    expect(JSON.parse([...everyAnswer][0])).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    as('u_admin');
    fails(await reports.getReport({ reportId: 'pr_does_not_exist' }), 'NOT_FOUND');
  });

  it('signed out, preview and paused get the same refusal for real, made-up, empty and malformed ids', async () => {
    const own = await report('s_noah', 'PUBLISHED');
    await db.user.update({ where: { id: 'u_grace' }, data: { status: 'PAUSED' } });
    for (const [who, code] of [[null, 'UNAUTHENTICATED'], ['u_tom', 'NOT_ACTIVE'], ['u_grace', 'NOT_ACTIVE']] as const) {
      as(who);
      const answers = new Set<string>();
      for (const reportId of [own.id, 'pr_does_not_exist', '', 'x'.repeat(500), undefined as unknown as string]) {
        const r = await reports.getReport({ reportId });
        fails(r, code);
        answers.add(JSON.stringify(r));
      }
      expect(answers.size, `${who}`).toBe(1);
    }
    await db.user.update({ where: { id: 'u_grace' }, data: { status: 'ACTIVE' } });
    as('u_grace');
    expect(ok(await reports.getReport({ reportId: own.id })).summary).toBe(SECRET);
  });
});
