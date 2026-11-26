/**
 * S1: Vienne's time off is hers alone, a family that isn't active never gets the
 * video link, and joinCall checks who's asking before it looks anything up.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as scheduling from '@/server/scheduling';

freshDemo();

const DAY = 86400000;
const REASON = 'S1-PRIVATE-REASON';
const range = (days: number) => ({ from: new Date().toISOString(), to: new Date(Date.now() + days * DAY).toISOString() });

afterEach(async () => {
  await db.user.update({ where: { id: 'u_grace' }, data: { status: 'ACTIVE' } });
});

describe('listTimeOff', () => {
  it('Vienne gets her time off as DTOs', async () => {
    await db.timeOff.create({ data: { startsAt: new Date(Date.now() + 40 * DAY), endsAt: new Date(Date.now() + 41 * DAY), reason: REASON } });
    as('u_admin');
    const rows = ok(await scheduling.listTimeOff());
    const mine = rows.find((r) => r.reason === REASON)!;
    expect(Object.keys(mine).sort()).toEqual(['endsAt', 'id', 'reason', 'startsAt']);
    expect(typeof mine.startsAt).toBe('string');
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(['endsAt', 'id', 'reason', 'startsAt']);
  });

  it('a parent, active or not, gets FORBIDDEN and never a reason; signed out gets UNAUTHENTICATED', async () => {
    for (const [who, status] of [['u_grace', 'ACTIVE'], ['u_grace', 'PAUSED'], ['u_tom', 'PREVIEW']] as const) {
      await db.user.update({ where: { id: who }, data: { status } });
      as(who);
      const r = await scheduling.listTimeOff();
      fails(r, 'FORBIDDEN');
      expect(JSON.stringify(r), `${who} ${status}`).not.toContain(REASON);
    }
    as(null);
    fails(await scheduling.listTimeOff(), 'UNAUTHENTICATED');
  });
});

describe('getOpenSlots', () => {
  it('still leaves out Vienne’s time off for families, without sending it', async () => {
    as('u_ana');
    const before = ok(await scheduling.getOpenSlots({ durationMin: 45, mode: 'VIDEO', ...range(21) }));
    expect(before.length).toBeGreaterThan(1);
    const target = before[1];
    const startsAt = new Date(new Date(target.startsAt).getTime() - 60000);
    const off = await db.timeOff.create({ data: { startsAt, endsAt: new Date(startsAt.getTime() + 3 * 3600000), reason: REASON } });
    try {
      const after = await scheduling.getOpenSlots({ durationMin: 45, mode: 'VIDEO', ...range(21) });
      const slots = ok(after);
      expect(slots.some((s) => s.startsAt === target.startsAt)).toBe(false);
      expect(slots.some((s) => new Date(s.startsAt) < off.endsAt && new Date(s.startsAt).getTime() + 45 * 60000 > off.startsAt.getTime())).toBe(false);
      expect(slots.length).toBeGreaterThan(0);
      expect(JSON.stringify(after)).not.toContain(REASON);
      expect(JSON.stringify(after)).not.toContain(off.id);
    } finally {
      await db.timeOff.delete({ where: { id: off.id } });
    }
  });
});

describe('listSessions for a family that isn’t active', () => {
  it('lists the sessions with no video link, even inside the join window', async () => {
    const live = await db.session.findUniqueOrThrow({ where: { id: 'ses_live' } });
    expect(live.meetingUrl).toMatch(/^https:\/\//);

    as('u_grace');
    expect(ok(await scheduling.listSessions()).find((s) => s.id === 'ses_live')?.meetingUrl).toBe(live.meetingUrl);
    const activeCount = ok(await scheduling.listSessions()).length;

    for (const status of ['PAUSED', 'PREVIEW'] as const) {
      await db.user.update({ where: { id: 'u_grace' }, data: { status } });
      const r = await scheduling.listSessions();
      const rows = ok(r);
      expect(rows.length, status).toBe(activeCount);
      expect(rows.some((s) => s.id === 'ses_live')).toBe(true);
      for (const s of rows) expect(s.meetingUrl, `${status} ${s.id}`).toBeNull();
      expect(JSON.stringify(r)).not.toContain(live.meetingUrl!);
    }

    as('u_admin');
    expect(ok(await scheduling.listSessions()).find((s) => s.id === 'ses_live')?.meetingUrl).toBe(live.meetingUrl);
  });
});

describe('joinCall checks the guard first', () => {
  it('a family gets the same FORBIDDEN for a missing id as for another family’s session', async () => {
    as('u_ana');
    const missing = await scheduling.joinCall({ sessionId: 'ses_does_not_exist' });
    const others = await scheduling.joinCall({ sessionId: 'ses_live' });
    fails(missing, 'FORBIDDEN');
    fails(others, 'FORBIDDEN');
    expect(missing).toEqual(others);
  });

  it('a paused or preview parent gets NOT_ACTIVE and signed out gets UNAUTHENTICATED, whatever the id', async () => {
    await db.session.update({ where: { id: 'ses_live' }, data: { callStartedAt: null } });
    for (const [who, status] of [['u_grace', 'PAUSED'], ['u_grace', 'PREVIEW'], ['u_tom', 'PREVIEW']] as const) {
      await db.user.update({ where: { id: who }, data: { status } });
      as(who);
      for (const sessionId of ['ses_live', 'ses_does_not_exist']) fails(await scheduling.joinCall({ sessionId }), 'NOT_ACTIVE');
    }
    as(null);
    for (const sessionId of ['ses_live', 'ses_does_not_exist']) fails(await scheduling.joinCall({ sessionId }), 'UNAUTHENTICATED');
    expect((await db.session.findUniqueOrThrow({ where: { id: 'ses_live' } })).callStartedAt).toBeNull();
  });

  it('Vienne still gets NOT_FOUND for a missing id; the family and Vienne still join their call', async () => {
    as('u_admin');
    fails(await scheduling.joinCall({ sessionId: 'ses_does_not_exist' }), 'NOT_FOUND');
    as('u_grace');
    expect(ok(await scheduling.joinCall({ sessionId: 'ses_live' })).meetingUrl).toMatch(/^https:\/\//);
    as('u_admin');
    expect(ok(await scheduling.joinCall({ sessionId: 'ses_live' })).meetingUrl).toMatch(/^https:\/\//);
  });
});
