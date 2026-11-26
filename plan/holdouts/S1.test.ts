/** S1 holdouts: no video link for a family that isn’t active, Vienne’s time off is hers, and session ids can’t be probed. */
import { afterEach, describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from '../../tests/integration/helpers';
import * as scheduling from '@/server/scheduling';
import * as families from '@/server/families';
import * as dashboard from '@/server/dashboard';
import * as notifications from '@/server/notifications';
import * as messages from '@/server/messages';

freshDemo();

const LINK = 'https://meet.example.com/HOLDOUT-S1-ROOM';
const REASON = 'HOLDOUT-S1-REASON';
const DAY = 86400000;
const range = () => ({ from: new Date().toISOString(), to: new Date(Date.now() + 30 * DAY).toISOString() });

afterEach(async () => {
  await db.user.update({ where: { id: 'u_grace' }, data: { status: 'ACTIVE' } });
});

/** Everything a parent’s screens can ask for; refusals are kept too, since they’re also sent. */
async function everythingGraceAsksFor() {
  as('u_grace');
  return {
    sessions: await scheduling.listSessions(),
    family: await families.getFamily({ parentId: 'u_grace' }),
    overview: await dashboard.getParentOverview({ studentId: 's_noah' }),
    settings: await scheduling.getSettings(),
    availability: await scheduling.getAvailability(),
    locations: await scheduling.listLocations(),
    slots: await scheduling.getOpenSlots({ durationMin: 45, mode: 'VIDEO', ...range() }),
    timeOff: await scheduling.listTimeOff(),
    notifications: await notifications.listForUser(),
    thread: await messages.getThread(),
    join: await scheduling.joinCall({ sessionId: 'ses_live' }),
  };
}

describe('S1 holdouts', () => {
  it('a paused or preview parent gets the video link from nothing they can ask for, inside the join window', async () => {
    await db.session.update({ where: { id: 'ses_live' }, data: { meetingUrl: LINK, startsAt: new Date(Date.now() + 5 * 60000), endsAt: new Date(Date.now() + 50 * 60000), status: 'CONFIRMED' } });
    await db.settings.update({ where: { id: 1 }, data: { defaultMeetingUrl: LINK } });
    for (const status of ['PAUSED', 'PREVIEW'] as const) {
      await db.user.update({ where: { id: 'u_grace' }, data: { status } });
      const sent = await everythingGraceAsksFor();
      const leaking = Object.entries(sent).filter(([, r]) => JSON.stringify(r).includes(LINK)).map(([name]) => name);
      expect(leaking, `${status}: reads that sent the link`).toEqual([]);
    }
  });

  it('Vienne’s time off: empty is an empty list, no family sees the reason or changes it', async () => {
    await db.timeOff.deleteMany();
    as('u_admin');
    expect(ok(await scheduling.listTimeOff())).toEqual([]);
    const off = await db.timeOff.create({ data: { startsAt: new Date(Date.now() + 3 * DAY), endsAt: new Date(Date.now() + 9 * DAY), reason: REASON } });
    expect(JSON.stringify(await everythingGraceAsksFor())).not.toContain(REASON);
    for (const [who, code] of [['u_ana', 'FORBIDDEN'], ['u_grace', 'FORBIDDEN'], ['u_tom', 'FORBIDDEN'], [null, 'UNAUTHENTICATED']] as const) {
      as(who);
      for (const r of [await scheduling.listTimeOff(), await scheduling.addTimeOff({ startsAt: range().from, endsAt: range().to, reason: 'x' }), await scheduling.removeTimeOff({ timeOffId: off.id })]) {
        fails(r, code);
        expect(JSON.stringify(r)).not.toContain(REASON);
      }
    }
    expect((await db.timeOff.findMany()).map((t) => t.id)).toEqual([off.id]);
  });

  it('joinCall answers the same for another family’s sessions of every kind and for made-up or malformed ids', async () => {
    const graces = await db.session.findMany({ where: { student: { parentId: 'u_grace' } } });
    expect(graces.length).toBeGreaterThan(1);
    as('u_ana');
    const answers = new Set<string>();
    for (const sessionId of [...graces.map((s) => s.id), 'ses_nope', "' OR 1=1 --"]) answers.add(JSON.stringify(await scheduling.joinCall({ sessionId })));
    expect([...answers]).toHaveLength(1);
    expect(JSON.parse([...answers][0])).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    for (const [who, code] of [['u_tom', 'NOT_ACTIVE'], [null, 'UNAUTHENTICATED']] as const) {
      as(who);
      for (const sessionId of ['', 'x'.repeat(500), undefined as unknown as string]) fails(await scheduling.joinCall({ sessionId }), code);
    }
  });
});
