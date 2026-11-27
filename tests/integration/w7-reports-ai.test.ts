/**
 * W7: progress reports, as the live screens use them (the AI helpers were removed in S33).
 * Sign-in goes through as(), never a mocked auth().
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as reports from '@/server/reports';

freshDemo();

describe('progress reports', () => {
  it('a draft stays hidden from the family; publishing tells them and shows it', async () => {
    as('u_admin');
    const draft = ok(await reports.createDraft({ studentId: 's_mateo' }));
    ok(await reports.updateReport({ reportId: draft.id, summary: 'Mateo is drawing a model before every word problem now.' }));
    ok(await reports.setRatings({ reportId: draft.id, ratings: [{ skillId: 'sk_word_problems', rating: 3 }] }));

    as('u_ana');
    expect(ok(await reports.listForStudent({ studentId: 's_mateo' })).map((r) => r.id)).not.toContain(draft.id);
    fails(await reports.getReport({ reportId: draft.id }), 'NOT_FOUND');
    const before = await db.notification.count({ where: { userId: 'u_ana', type: 'REPORT_PUBLISHED' } });

    as('u_admin');
    ok(await reports.publishReport({ reportId: draft.id }));
    expect(await db.notification.count({ where: { userId: 'u_ana', type: 'REPORT_PUBLISHED' } })).toBe(before + 1);

    as('u_ana');
    expect(ok(await reports.listForStudent({ studentId: 's_mateo' })).map((r) => r.summary)).toContain('Mateo is drawing a model before every word problem now.');
    expect(ok(await reports.getReport({ reportId: draft.id })).summary).toMatch(/drawing a model/);
  });

  it('permissions: another family can’t read it, and only Vienne can write or publish', async () => {
    as('u_admin');
    const r = ok(await reports.createDraft({ studentId: 's_mateo' }));
    as('u_grace');
    fails(await reports.listForStudent({ studentId: 's_mateo' }), 'FORBIDDEN');
    fails(await reports.getReport({ reportId: r.id }), 'FORBIDDEN');
    as('u_ana');
    fails(await reports.createDraft({ studentId: 's_mateo' }), 'FORBIDDEN');
    fails(await reports.updateReport({ reportId: r.id, summary: 'mine now' }), 'FORBIDDEN');
    fails(await reports.publishReport({ reportId: r.id }), 'FORBIDDEN');
    as(null);
    expect((await reports.listForStudent({ studentId: 's_mateo' })).ok).toBe(false);
  });
});
