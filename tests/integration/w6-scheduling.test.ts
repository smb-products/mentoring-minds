/**
 * W6: the scheduling rules the screens now read live. The join window follows
 * Settings.joinOpensMin, parents never get the video link outside it, and one
 * family can't touch another's sessions.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok, upcomingSession } from './helpers';
import * as scheduling from '@/server/scheduling';

freshDemo();

const MIN = 60000;

/** Moves one of Grace's confirmed video sessions to start `minutes` from now. */
async function videoSessionIn(minutes: number) {
  const s = await upcomingSession({ parentId: 'u_grace', mode: 'VIDEO', minHoursAway: 30 });
  const startsAt = new Date(Date.now() + minutes * MIN);
  await db.session.update({ where: { id: s.id }, data: { startsAt, endsAt: new Date(startsAt.getTime() + s.durationMin * MIN), callStartedAt: null } });
  return s;
}

describe('the join window', () => {
  afterAll(async () => {
    await db.settings.update({ where: { id: 1 }, data: { joinOpensMin: 15 } });
  });

  it('opens Settings.joinOpensMin before the start: the link and Join call only inside it', async () => {
    as('u_admin');
    ok(await scheduling.updateSettings({ joinOpensMin: 30 }));
    const s = await videoSessionIn(20);

    as('u_grace');
    const row = ok(await scheduling.listSessions({ studentId: s.studentId })).find((x) => x.id === s.id)!;
    expect(row.meetingUrl).toMatch(/^https:\/\//);
    expect(ok(await scheduling.joinCall({ sessionId: s.id })).meetingUrl).toBe(row.meetingUrl);
    expect((await db.session.findUniqueOrThrow({ where: { id: s.id } })).callStartedAt).not.toBeNull();

    as('u_admin');
    ok(await scheduling.updateSettings({ joinOpensMin: 10 }));
    as('u_grace');
    const closed = ok(await scheduling.listSessions({ studentId: s.studentId })).find((x) => x.id === s.id)!;
    expect(closed.meetingUrl).toBeNull();
    fails(await scheduling.joinCall({ sessionId: s.id }), 'INVALID', /opens 10 minutes before/);
  });

  it('a parent’s own writes never hand back the video link outside the window', async () => {
    as('u_grace');
    const far = await upcomingSession({ parentId: 'u_grace', mode: 'VIDEO', minHoursAway: 72 });
    const cancelled = ok(await scheduling.cancelSession({ sessionId: far.id }));
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.meetingUrl).toBeNull();
  });
});

describe('permissions', () => {
  it('another family can’t join, cancel or read Grace’s video session', async () => {
    const s = await db.session.findUniqueOrThrow({ where: { id: 'ses_live' } }); // Noah's, in its join window
    as('u_ana');
    fails(await scheduling.joinCall({ sessionId: s.id }), 'FORBIDDEN');
    fails(await scheduling.cancelSession({ sessionId: s.id }), 'FORBIDDEN');
    expect(ok(await scheduling.listSessions({})).some((x) => x.id === s.id)).toBe(false);
    expect((await db.session.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('CONFIRMED');
  });

  it('only Vienne confirms, declines or completes', async () => {
    const req = await db.session.findFirstOrThrow({ where: { requestedById: 'u_keisha', status: 'REQUESTED' } });
    as('u_keisha');
    fails(await scheduling.confirmSession({ sessionId: req.id }), 'FORBIDDEN');
    fails(await scheduling.declineSession({ sessionId: req.id, reason: 'no' }), 'FORBIDDEN');
    as('u_admin');
    const declined = ok(await scheduling.declineSession({ sessionId: req.id, reason: 'I’m booked then. Could Thursday work?' }));
    expect(declined).toMatchObject({ status: 'DECLINED', declineReason: 'I’m booked then. Could Thursday work?' });
  });
});
