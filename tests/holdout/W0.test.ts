/**
 * W0 holdouts: the dashboard is now live, so what it answers is what families really get.
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok, valuesOf } from '../integration/helpers';
import * as dashboard from '@/server/dashboard';

freshDemo();

describe('the live dashboard', () => {
  it('refuses the other parent, a preview parent, a signed-out visitor and bad input', async () => {
    as('u_ana');
    fails(await dashboard.getParentOverview({ studentId: 's_noah' }), 'FORBIDDEN');
    fails(await dashboard.getAdminToday(), 'FORBIDDEN');
    fails(await dashboard.getParentOverview({ studentId: '' }), 'INVALID');
    as('u_grace');
    fails(await dashboard.getParentOverview({ studentId: 's_mateo' }), 'FORBIDDEN');
    as('u_tom');
    fails(await dashboard.getParentOverview({ studentId: 's_noah' }), 'NOT_ACTIVE');
    fails(await dashboard.getAdminToday(), 'FORBIDDEN');
    as(null);
    fails(await dashboard.getParentOverview({ studentId: 's_noah' }), 'UNAUTHENTICATED');
    fails(await dashboard.getAdminToday(), 'UNAUTHENTICATED');
  });

  it('gives a family no private note, adminNotes, answer key or early video link', async () => {
    // Noah's call moved to three hours from now (outside the join window), and every note made private.
    const startsAt = new Date(Date.now() + 3 * 3600000);
    await db.session.update({ where: { id: 'ses_live' }, data: { startsAt, endsAt: new Date(startsAt.getTime() + 45 * 60000) } });
    await db.sessionNote.updateMany({ where: { session: { studentId: 's_noah' } }, data: { sharedWithParent: false } });
    as('u_grace');
    const o = ok(await dashboard.getParentOverview({ studentId: 's_noah' }));
    expect(o.nextSession).toBeTruthy();
    expect(valuesOf(o, 'meetingUrl').filter(Boolean)).toEqual([]);
    expect(o.lastSessionNote).toBeNull();
    expect(valuesOf(o, 'note').filter(Boolean)).toEqual([]);
    for (const key of ['adminNotes', 'answer', 'passwordHash', 'codeHash', 'defaultMeetingUrl']) expect(valuesOf(o, key).filter(Boolean), key).toEqual([]);
    expect(JSON.stringify(o)).not.toContain('timed work');
  });

  it('a child with nothing yet gets an empty overview, not another child’s', async () => {
    await db.student.create({ data: { id: 's_new', parentId: 'u_grace', firstName: 'Nia', lastName: 'Kim', grade: 5, schoolYear: '2026–27' } });
    as('u_grace');
    const o = ok(await dashboard.getParentOverview({ studentId: 's_new' }));
    expect(o).toMatchObject({ nextSession: null, pendingRequests: [], todo: [], starsTotal: 0, completedCount: 0, lastSessionNote: null, latestReport: null, redoCount: 0, latestResult: null });
  });
});
