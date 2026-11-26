/**
 * S5b: the redeem limits hold when tries arrive at once. The account's count is read
 * again under the advisory lock, a right code is checked against the global limit
 * under the same lock before it's claimed, and the daily clean-up drops old rows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as invites from '@/server/invites';
import { cleanUp } from '@/lib/jobs';

freshDemo();

const GLOBAL = /^Too many tries right now\. Try again in an hour, or ask Vienne to check the code\.$/;
const ACCOUNT = /^Too many tries\. Wait an hour, or ask Vienne to check the code\.$/;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
let n = 0;
const guesser = async () => db.user.create({ data: { email: `s5b.guesser.${(n += 1)}@example.com`, name: `Guesser ${n}`, status: 'PREVIEW' } });
const wrong = (i: number) => `MM-Y${String(i).padStart(3, '0').replace(/[01]/g, 'Y')}`;
const newCode = async (parentName: string) => {
  as('u_admin');
  return ok(await invites.createInvite({ parentName, plannedStudents: [{ firstName: 'Kid', grade: 3 }] })).code;
};
/** Wrong-code rows written straight to the table, `ago` ms in the past. */
const failuresAt = async (count: number, ago: number) => {
  const g = await guesser();
  await db.redeemFailure.createMany({ data: Array.from({ length: count }, () => ({ userId: g.id, at: new Date(Date.now() - ago) })) });
};
const codes = (rs: { ok: boolean; code?: string }[]) => rs.map((r) => (r.ok ? 'OK' : r.code));

beforeEach(async () => {
  await db.redeemFailure.deleteMany();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('S5b: permissions', () => {
  it('signed out: refused, and nothing is counted', async () => {
    as(null);
    const rs = await Promise.all(Array.from({ length: 3 }, (_, i) => invites.redeemInvite({ code: wrong(i) })));
    for (const r of rs) fails(r, 'UNAUTHENTICATED');
    expect(await db.redeemFailure.count()).toBe(0);
  });

  it('Vienne: refused, and nothing is counted', async () => {
    as('u_admin');
    fails(await invites.redeemInvite({ code: wrong(1) }), 'INVALID', /^Invite codes are for families$/);
    expect(await db.redeemFailure.count()).toBe(0);
  });
});

describe('S5b: wrong codes sent at once from one account', () => {
  it('each one counts from the latest value', async () => {
    const g = await guesser();
    as(g.id);
    const rs = await Promise.all(Array.from({ length: 5 }, (_, i) => invites.redeemInvite({ code: wrong(i) })));
    for (const r of rs) fails(r, 'INVALID_CODE');
    expect((await db.user.findUniqueOrThrow({ where: { id: g.id } })).redeemFailures).toBe(5);
    expect(await db.redeemFailure.count({ where: { userId: g.id } })).toBe(5);
  });

  it('MAX_FAILURES at once lock the account; the extra ones and the next try get LOCKED', async () => {
    const code = await newCode('S5b Parallel Family');
    const g = await guesser();
    as(g.id);
    const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => invites.redeemInvite({ code: wrong(i) })));
    const got = codes(rs);
    expect(got.filter((c) => c === 'INVALID_CODE')).toHaveLength(10);
    expect(got.filter((c) => c === 'LOCKED')).toHaveLength(2);
    for (const r of rs) if (!r.ok && r.code === 'LOCKED') expect(r.error).toMatch(ACCOUNT);
    expect(await db.redeemFailure.count({ where: { userId: g.id } })).toBe(10);
    const after = await db.user.findUniqueOrThrow({ where: { id: g.id } });
    expect(after.redeemLockedUntil!.getTime()).toBeGreaterThan(Date.now() + HOUR - 60000);

    fails(await invites.redeemInvite({ code: wrong(99) }), 'LOCKED', ACCOUNT);
    // The right code waits too, and isn't used up.
    fails(await invites.redeemInvite({ code }), 'LOCKED', ACCOUNT);
    expect(await db.redeemFailure.count({ where: { userId: g.id } })).toBe(10);
    expect((await db.invite.findFirstOrThrow({ where: { parentName: 'S5b Parallel Family' } })).usedAt).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: g.id } })).status).toBe('PREVIEW');
  });
});

describe('S5b: a right code past the global limit', () => {
  it('gets the same LOCKED as a wrong code, adds no row, and the code isn’t used up until the hour passes', async () => {
    const code = await newCode('S5b Global Family');
    await failuresAt(31, 60000);
    const g = await guesser();
    as(g.id);
    const right = await invites.redeemInvite({ code });
    const bad = await invites.redeemInvite({ code: wrong(7) });
    fails(right, 'LOCKED', GLOBAL);
    fails(bad, 'LOCKED', GLOBAL);
    expect(!right.ok && !bad.ok && right.error === bad.error).toBe(true);
    expect(await db.redeemFailure.count()).toBe(31);
    expect((await db.invite.findFirstOrThrow({ where: { parentName: 'S5b Global Family' } })).usedAt).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: g.id } })).status).toBe('PREVIEW');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + HOUR + 60000);
    expect(ok(await invites.redeemInvite({ code }))).toEqual({ status: 'ACTIVE' });
  });

  it('is checked under the advisory lock: a failure that lands while it waits still stops it', async () => {
    const code = await newCode('S5b Race Family');
    await failuresAt(30, 60000); // at the limit, not past it: the check outside the lock lets it through
    const g = await guesser();
    as(g.id);
    let pending!: ReturnType<typeof invites.redeemInvite>;
    await db.$transaction(
      async (tx) => {
        // Hold the failure path's lock and add the 31st failure, as a parallel wrong code would.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7300530001)`;
        await tx.redeemFailure.create({ data: { userId: g.id, at: new Date() } });
        pending = invites.redeemInvite({ code });
        // Wait until the redeem is queued on the lock (it has passed the check outside it).
        for (let i = 0; i < 200; i += 1) {
          const waiting = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
          if (waiting[0].n > 0) return;
          await new Promise((r) => setTimeout(r, 20));
        }
        throw new Error('the redeem never waited on the lock');
      },
      { timeout: 15000 },
    );
    fails(await pending, 'LOCKED', GLOBAL);
    expect(await db.redeemFailure.count()).toBe(31);
    expect((await db.invite.findFirstOrThrow({ where: { parentName: 'S5b Race Family' } })).usedAt).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: g.id } })).status).toBe('PREVIEW');
  });
});

describe('S5b: daily clean-up', () => {
  it('deletes RedeemFailure rows over a day old and says how many; the last hour’s rows still count', async () => {
    await failuresAt(4, DAY + HOUR);
    await failuresAt(2, 3 * DAY);
    await failuresAt(3, 2 * HOUR);
    await failuresAt(31, 10 * 60000);
    const r = await cleanUp();
    expect(r.redeemFailures).toBe(6);
    expect(await db.redeemFailure.count()).toBe(34);
    expect(await db.redeemFailure.count({ where: { at: { lt: new Date(Date.now() - DAY) } } })).toBe(0);

    // The 31 from the last hour still hold code entry shut.
    const g = await guesser();
    as(g.id);
    fails(await invites.redeemInvite({ code: wrong(3) }), 'LOCKED', GLOBAL);

    // A second run finds nothing more to do.
    expect((await cleanUp()).redeemFailures).toBe(0);
  });
});
