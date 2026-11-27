/**
 * W7 holdout: a report reaches only its own family, without Vienne's private notes
 * or the answer key. (The AI helper cases went with the helpers in S33.)
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok, valuesOf } from '../integration/helpers';
import * as reports from '@/server/reports';

freshDemo();

const PRIVATE = 'W7-PRIVATE-NOTE only Vienne reads this';

describe('W7: reports', () => {
  it('a published report reaches only its own family, with no private notes, answer key or video link', async () => {
    await db.student.update({ where: { id: 's_mateo' }, data: { adminNotes: PRIVATE } });
    await db.session.updateMany({ where: { studentId: 's_mateo' }, data: { meetingUrl: 'https://video.example.com/w7-room' } });
    as('u_admin');
    const r = ok(await reports.createDraft({ studentId: 's_mateo' }));
    ok(await reports.updateReport({ reportId: r.id, summary: 'W7 summary for Mateo.', periodStart: '2020-01-01T00:00:00.000Z', periodEnd: '2035-01-01T00:00:00.000Z' }));
    ok(await reports.setRatings({ reportId: r.id, ratings: [{ skillId: 'sk_word_problems', rating: 3 }] }));
    ok(await reports.publishReport({ reportId: r.id }));

    as('u_ana');
    const seen = [ok(await reports.getReport({ reportId: r.id })), ok(await reports.listForStudent({ studentId: 's_mateo' }))];
    const text = JSON.stringify(seen);
    expect(text).toContain('W7 summary for Mateo.');
    expect(text).not.toContain(PRIVATE);
    expect(text).not.toContain('w7-room');
    for (const key of ['adminNotes', 'answer', 'answers', 'meetingUrl', 'passwordHash', 'codeHash', 'codeHint']) expect(valuesOf(seen, key), key).toEqual([]);

    for (const [who, code] of [['u_grace', 'FORBIDDEN'], ['u_tom', 'NOT_ACTIVE'], [null, 'UNAUTHENTICATED']] as const) {
      as(who);
      for (const res of [await reports.getReport({ reportId: r.id }), await reports.listForStudent({ studentId: 's_mateo' })]) {
        fails(res, code);
        expect(JSON.stringify(res)).not.toContain('W7 summary');
      }
    }
  });

  it('empty and wrong input: a blank draft can’t be published, tells nobody and stays hidden; publishing twice tells the family once', async () => {
    const told = () => db.notification.count({ where: { userId: 'u_grace', type: 'REPORT_PUBLISHED' } });
    await db.progressReport.deleteMany({ where: { studentId: 's_noah' } });
    const before = await told();
    as('u_grace');
    expect(ok(await reports.listForStudent({ studentId: 's_noah' }))).toEqual([]);

    as('u_admin');
    const r = ok(await reports.createDraft({ studentId: 's_noah' }));
    expect((await reports.publishReport({ reportId: r.id })).ok).toBe(false);
    ok(await reports.updateReport({ reportId: r.id, summary: '   ' }));
    ok(await reports.setRatings({ reportId: r.id, ratings: [{ skillId: 'sk_word_problems', rating: 2 }] }));
    expect((await reports.publishReport({ reportId: r.id })).ok).toBe(false);
    expect((await reports.setRatings({ reportId: r.id, ratings: [{ skillId: 'sk_word_problems', rating: 5 }] })).ok).toBe(false);
    expect((await reports.updateReport({ reportId: r.id, periodStart: '2030-01-02T00:00:00.000Z', periodEnd: '2030-01-01T00:00:00.000Z' })).ok).toBe(false);
    expect(await told()).toBe(before);
    as('u_grace');
    expect(ok(await reports.listForStudent({ studentId: 's_noah' }))).toEqual([]);
    fails(await reports.getReport({ reportId: r.id }), 'NOT_FOUND');

    as('u_admin');
    ok(await reports.updateReport({ reportId: r.id, summary: 'Noah is checking his work.' }));
    ok(await reports.publishReport({ reportId: r.id }));
    ok(await reports.publishReport({ reportId: r.id }));
    expect(await told()).toBe(before + 1);
  });
});
