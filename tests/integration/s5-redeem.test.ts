/**
 * S5: invite codes can't be brute-forced across accounts. Wrong codes are counted
 * across every account (RedeemFailure); more than 30 in an hour pauses code entry
 * for everyone, and Vienne is told once.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as invites from '@/server/invites';

freshDemo();

const GLOBAL = /^Too many tries right now\. Try again in an hour, or ask Vienne to check the code\.$/;
const HOUR = 60 * 60 * 1000;
let n = 0;
const guesser = async () => db.user.create({ data: { email: `s5.guesser.${(n += 1)}@example.com`, name: `Guesser ${n}`, status: 'PREVIEW' } });
const wrong = (i: number) => `MM-Z${String(i).padStart(3, '0').replace(/[01]/g, 'Z')}`;
const failuresNow = () => db.redeemFailure.count();
const alerts = () => db.notification.count({ where: { type: 'INVITE_GUESSING', user: { role: 'ADMIN' } } });
const admins = () => db.user.count({ where: { role: 'ADMIN' } });
const newCode = async () => {
  as('u_admin');
  return ok(await invites.createInvite({ parentName: 'Real Family', plannedStudents: [{ firstName: 'Kid', grade: 3 }] })).code;
};

/** `count` wrong codes, 10 per account (the per-account limit), from fresh accounts. */
async function burn(count: number) {
  let left = count;
  while (left > 0) {
    const g = await guesser();
    as(g.id);
    for (let i = 0; i < Math.min(10, left); i += 1) fails(await invites.redeemInvite({ code: wrong(left - i) }), 'INVALID_CODE');
    left -= 10;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('S5: global invite-code limit', () => {
  it('signed out: refused, and no failure is counted', async () => {
    as(null);
    fails(await invites.redeemInvite({ code: 'MM-ZZZZ' }), 'UNAUTHENTICATED');
    expect(await failuresNow()).toBe(0);
  });

  it('every wrong code adds a RedeemFailure row; a per-account lock refusal adds none', async () => {
    const g = await guesser();
    as(g.id);
    fails(await invites.redeemInvite({ code: 'MM-ZZZZ' }), 'INVALID_CODE');
    const row = await db.redeemFailure.findFirstOrThrow({ where: { userId: g.id } });
    expect(Math.abs(row.at.getTime() - Date.now())).toBeLessThan(60000);
    for (let i = 0; i < 9; i += 1) fails(await invites.redeemInvite({ code: wrong(i + 2) }), 'INVALID_CODE');
    expect(await db.redeemFailure.count({ where: { userId: g.id } })).toBe(10);

    // Locked by the per-account limit: refused, and nothing counted.
    fails(await invites.redeemInvite({ code: 'MM-ZZZZ' }), 'LOCKED', /^Too many tries\. Wait an hour/);
    fails(await invites.redeemInvite({ code: 'MM-ZZZY' }), 'LOCKED');
    expect(await db.redeemFailure.count({ where: { userId: g.id } })).toBe(10);
    expect(await alerts()).toBe(0);

    // The rows go when the account does.
    await db.user.delete({ where: { id: g.id } });
    expect(await failuresNow()).toBe(0);
  });

  it('the 31st failure in an hour locks every account, a right code included; an hour later it works again; Vienne is told once', async () => {
    const code = await newCode();
    await burn(30);
    expect(await failuresNow()).toBe(30);
    expect(await alerts()).toBe(0);

    // The 31st wrong code still counts, and reaches the limit: one alert per admin.
    const last = await guesser();
    as(last.id);
    fails(await invites.redeemInvite({ code: 'MM-YYYY' }), 'INVALID_CODE');
    expect(await failuresNow()).toBe(31);
    expect(await alerts()).toBe(await admins());
    const alert = await db.notification.findFirstOrThrow({ where: { type: 'INVITE_GUESSING' } });
    expect(alert.title).toBe('Invite codes paused for an hour');
    expect(alert.href).toBe('/admin/families');

    // Now every account is locked, even with the right code, and nothing more is counted.
    fails(await invites.redeemInvite({ code }), 'LOCKED', GLOBAL);
    const fresh = await guesser();
    as(fresh.id);
    fails(await invites.redeemInvite({ code }), 'LOCKED', GLOBAL);
    for (let i = 0; i < 5; i += 1) fails(await invites.redeemInvite({ code: wrong(i) }), 'LOCKED', GLOBAL);
    const lockedByAccount = await db.redeemFailure.findFirstOrThrow({ select: { userId: true } });
    as(lockedByAccount.userId);
    fails(await invites.redeemInvite({ code }), 'LOCKED', GLOBAL);
    expect(await failuresNow()).toBe(31);
    expect(await alerts()).toBe(await admins()); // never one per try
    expect((await db.user.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe('PREVIEW');
    expect((await db.invite.findFirstOrThrow({ where: { parentName: 'Real Family' } })).usedAt).toBeNull();

    // An hour later the count has dropped, and the right code works.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + HOUR + 60000);
    as(fresh.id);
    expect(ok(await invites.redeemInvite({ code }))).toEqual({ status: 'ACTIVE' });
    expect(await alerts()).toBe(await admins());
  });

  it('reaching the limit again in a later hour alerts again, once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 3 * HOUR);
    const before = await alerts();
    await burn(31);
    expect(await alerts()).toBe(before + (await admins()));
    const g = await guesser();
    as(g.id);
    fails(await invites.redeemInvite({ code: 'MM-YYYY' }), 'LOCKED', GLOBAL);
    expect(await alerts()).toBe(before + (await admins()));
  });

  it('the table is made by a committed migration, indexed on at', async () => {
    const idx = await db.$queryRaw<{ indexname: string }[]>`SELECT indexname::text AS indexname FROM pg_indexes WHERE tablename = 'RedeemFailure'`;
    expect(idx.map((r) => r.indexname)).toContain('RedeemFailure_at_idx');
    const fk = await db.$queryRaw<{ delete_rule: string }[]>`SELECT rc.delete_rule::text AS delete_rule FROM information_schema.referential_constraints rc WHERE rc.constraint_name = 'RedeemFailure_userId_fkey'`;
    expect(fk.map((r) => r.delete_rule)).toEqual(['CASCADE']);
  });
});
