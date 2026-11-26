/** W6 holdouts: the video link only inside the join window; only a child’s own family books, joins or cancels. */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok, valuesOf } from '../integration/helpers';
import * as scheduling from '@/server/scheduling';
import * as families from '@/server/families';
import * as dashboard from '@/server/dashboard';
import * as notifications from '@/server/notifications';
import * as messages from '@/server/messages';

freshDemo();

const link = 'https://meet.example.com/HOLDOUT-ROOM';
const MIN = 60000;

/** One of Noah’s video sessions, moved to `fromNow` minutes from now. */
async function place(fromNow: number, status: 'REQUESTED' | 'CONFIRMED' | 'CANCELLED' = 'CONFIRMED') {
  const s = await db.session.findFirstOrThrow({ where: { studentId: 's_noah', mode: 'VIDEO' }, orderBy: { id: 'asc' } });
  const startsAt = new Date(Date.now() + fromNow * MIN);
  await db.session.updateMany({ where: { studentId: 's_noah' }, data: { meetingUrl: null } });
  return db.session.update({ where: { id: s.id }, data: { startsAt, endsAt: new Date(startsAt.getTime() + 45 * MIN), durationMin: 45, status, meetingUrl: link, callStartedAt: null } });
}

async function everythingGraceReads() {
  as('u_grace');
  return [
    ok(await scheduling.listSessions()),
    ok(await scheduling.getSettings()),
    ok(await families.getFamily({ parentId: 'u_grace' })),
    ok(await dashboard.getParentOverview({ studentId: 's_noah' })),
    ok(await notifications.listForUser()),
    ok(await messages.getThread()),
  ];
}

describe('W6: leaks and the wrong person', () => {
  it('no family read carries the video link before the window, after the end, or unless confirmed', async () => {
    await db.settings.update({ where: { id: 1 }, data: { defaultMeetingUrl: link, joinOpensMin: 15 } });
    for (const [fromNow, status] of [[25, 'CONFIRMED'], [-50, 'CONFIRMED'], [5, 'REQUESTED'], [5, 'CANCELLED']] as const) {
      const s = await place(fromNow, status);
      expect(JSON.stringify(await everythingGraceReads()), `${fromNow} ${status}`).not.toContain(link);
      fails(await scheduling.joinCall({ sessionId: s.id }), 'INVALID');
      expect((await db.session.findUniqueOrThrow({ where: { id: s.id } })).callStartedAt).toBeNull();
    }
    const s = await place(10);
    as('u_grace');
    expect(ok(await scheduling.listSessions()).find((x) => x.id === s.id)?.meetingUrl).toBe(link);
    for (const [who, code] of [['u_ana', 'FORBIDDEN'], ['u_tom', 'NOT_ACTIVE'], [null, 'UNAUTHENTICATED']] as const) {
      as(who);
      fails(await scheduling.joinCall({ sessionId: s.id }), code);
      fails(await scheduling.cancelSession({ sessionId: s.id }), code);
      fails(await scheduling.requestSession({ studentId: 's_noah', mode: 'VIDEO', startsAt: new Date(Date.now() + 5 * 86400000).toISOString(), durationMin: 45 }), code);
      const admin = who ? 'FORBIDDEN' : 'UNAUTHENTICATED';
      fails(await scheduling.confirmSession({ sessionId: s.id }), admin);
      fails(await scheduling.declineSession({ sessionId: s.id }), admin);
      fails(await scheduling.completeSession({ sessionId: s.id, attendance: 'PRESENT', summary: 'x' }), admin);
      fails(await scheduling.setMeetingUrl({ sessionId: s.id, meetingUrl: link }), admin);
    }
    for (const who of ['u_ana', 'u_tom']) {
      as(who);
      expect(ok(await scheduling.listSessions({ studentId: 's_noah' })), who).toEqual([]);
    }
    as(null);
    fails(await scheduling.listSessions(), 'UNAUTHENTICATED');
    expect(await db.session.findUniqueOrThrow({ where: { id: s.id } })).toEqual(s);
  });

  it('a note Vienne keeps private never reaches the family', async () => {
    const s = await place(-60);
    await db.sessionNote.deleteMany({ where: { sessionId: s.id } });
    as('u_admin');
    ok(await scheduling.completeSession({ sessionId: s.id, attendance: 'PRESENT', summary: 'HOLDOUT-PRIVATE-NOTE', sharedWithParent: false }));
    const seen = await everythingGraceReads();
    expect(JSON.stringify(seen)).not.toContain('HOLDOUT-PRIVATE-NOTE');
    expect(valuesOf(seen, 'adminNotes')).toEqual([]);
  });

  it('a parent’s own request and cancel send back no private student note and no video link', async () => {
    await db.student.update({ where: { id: 's_noah' }, data: { adminNotes: 'HOLDOUT-ADMIN-NOTE' } });
    await db.settings.update({ where: { id: 1 }, data: { defaultMeetingUrl: link } });
    as('u_grace');
    const from = new Date(Date.now() + 3 * 86400000).toISOString();
    const to = new Date(Date.now() + 20 * 86400000).toISOString();
    const slots = ok(await scheduling.getOpenSlots({ durationMin: 45, mode: 'VIDEO', from, to }));
    const requested = ok(await scheduling.requestSession({ studentId: 's_noah', mode: 'VIDEO', startsAt: new Date(slots[0].startsAt).toISOString(), durationMin: 45 }));
    as('u_admin');
    ok(await scheduling.confirmSession({ sessionId: requested.id }));
    as('u_grace');
    const cancelled = ok(await scheduling.cancelSession({ sessionId: requested.id }));
    for (const [what, sent] of [['request', requested], ['cancel', cancelled]] as const) {
      expect(JSON.stringify(sent), what).not.toContain('HOLDOUT-ADMIN-NOTE');
      expect(JSON.stringify(sent), what).not.toContain(link);
    }
  });

  it('wrong booking input is refused and saves nothing', async () => {
    const before = await db.session.count();
    as('u_grace');
    const soon = new Date(Date.now() + 60 * MIN).toISOString();
    const base = { studentId: 's_noah', mode: 'VIDEO' as const, startsAt: soon, durationMin: 45 };
    fails(await scheduling.requestSession(base), 'INVALID', /notice/);
    fails(await scheduling.requestSession({ ...base, durationMin: 17 }), 'INVALID');
    fails(await scheduling.requestSession({ ...base, startsAt: 'next Monday' }), 'INVALID');
    expect(await db.session.count()).toBe(before);
  });
});
