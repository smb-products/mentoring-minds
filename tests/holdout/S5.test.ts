/** S5 holdouts: the shared limit starts only past 30, only real guesses count, and only Vienne hears of it. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { as, db, fails, ok } from '../integration/helpers';
import { loadDemo, truncateAll } from '../../prisma/data';
import * as invites from '@/server/invites';
import * as notifications from '@/server/notifications';

const HOUR = 60 * 60 * 1000;
let n = 0;

beforeEach(async () => {
  await truncateAll(db as never);
  await loadDemo(db as never);
});
afterEach(() => {
  vi.useRealTimers();
});

const newcomer = () => db.user.create({ data: { email: `holdout.s5.${(n += 1)}@example.com`, name: `Holdout ${n}`, status: 'PREVIEW' } });

async function invite(parentName = 'Holdout Family') {
  as('u_admin');
  return ok(await invites.createInvite({ parentName, plannedStudents: [{ firstName: 'Kid', grade: 3 }] }));
}

/** `count` tries of `code` (a wrong one by default), at most 9 per fresh account. */
async function guess(count: number, code = 'MM-ZZZZ') {
  for (let done = 0; done < count; ) {
    as((await newcomer()).id);
    for (let i = 0; i < 9 && done < count; i += 1, done += 1) fails(await invites.redeemInvite({ code }), 'INVALID_CODE');
  }
}

describe('S5 holdouts', () => {
  it('30 wrong codes pause nobody, and wrong codes older than an hour stop counting', async () => {
    const first = await invite('First Family');
    const second = await invite('Second Family');
    await guess(30);
    as((await newcomer()).id);
    expect(ok(await invites.redeemInvite({ code: first.code }))).toEqual({ status: 'ACTIVE' });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + HOUR + 60000);
    await guess(30);
    as((await newcomer()).id);
    expect(ok(await invites.redeemInvite({ code: second.code }))).toEqual({ status: 'ACTIVE' });
  });

  it('signed-out, paused and Vienne’s own tries never pause code entry for a real family', async () => {
    const real = await invite();
    const paused = await newcomer();
    await db.user.update({ where: { id: paused.id }, data: { status: 'PAUSED' } });
    for (let i = 0; i < 35; i += 1) {
      for (const [who, code] of [[null, 'UNAUTHENTICATED'], [paused.id, 'FORBIDDEN'], ['u_admin', 'INVALID']] as const) {
        as(who);
        fails(await invites.redeemInvite({ code: 'MM-ZZZZ' }), code);
      }
    }
    as((await newcomer()).id);
    expect(ok(await invites.redeemInvite({ code: real.code }))).toEqual({ status: 'ACTIVE' });
  });

  it('revoked codes count as guesses, and the alert reaches Vienne only, with no code or guesser in it', async () => {
    const revoked = await invite();
    ok(await invites.revokeInvite({ inviteId: revoked.invite.id }));
    const live = await invite('Waiting Family');
    await guess(31, revoked.code);
    as('u_tom');
    fails(await invites.redeemInvite({ code: live.code }), 'LOCKED');

    const mine = async (who: string) => {
      as(who);
      return ok(await notifications.listForUser()).filter((x) => x.type === 'INVITE_GUESSING');
    };
    for (const who of ['u_ana', 'u_grace', 'u_tom']) expect(await mine(who), who).toEqual([]);
    const alerts = await mine('u_admin');
    expect(alerts).toHaveLength(1);
    const text = `${alerts[0].title} ${alerts[0].body} ${alerts[0].href}`;
    expect(text).not.toContain(revoked.code);
    expect(text).not.toContain(live.code);
    expect(text).not.toMatch(/holdout\.s5|Holdout \d|Waiting Family/);
    as(null);
    fails(await notifications.listForUser(), 'UNAUTHENTICATED');
  });
});
