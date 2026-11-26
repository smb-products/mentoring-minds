/** S5b holdouts: one account can’t pause code entry for everyone, one code makes one family, and the clean-up keeps today’s tries. */
import { beforeEach, describe, expect, it } from 'vitest';
import { as, db, fails, ok } from '../integration/helpers';
import { loadDemo, truncateAll } from '../../prisma/data';
import * as invites from '@/server/invites';
import * as notifications from '@/server/notifications';
import { cleanUp } from '@/lib/jobs';

const HOUR = 60 * 60 * 1000;
let n = 0;

beforeEach(async () => {
  await truncateAll(db as never);
  await loadDemo(db as never);
});

const newcomer = () => db.user.create({ data: { email: `holdout.s5b.${(n += 1)}@example.com`, name: `Holdout ${n}`, status: 'PREVIEW' } });

async function invite() {
  as('u_admin');
  return ok(await invites.createInvite({ parentName: 'Holdout Family', plannedStudents: [{ firstName: 'Holdoutkid', grade: 3 }] })).code;
}

describe('S5b holdouts', () => {
  it('one account firing 40 wrong codes at once locks only itself: another family still joins and Vienne isn’t alarmed', async () => {
    const code = await invite();
    as((await newcomer()).id);
    const burst = await Promise.all(Array.from({ length: 40 }, () => invites.redeemInvite({ code: 'MM-ZZZZ' })));
    const got = burst.map((r) => (r.ok ? 'OK' : r.code));
    expect(got.filter((c) => c === 'INVALID_CODE')).toHaveLength(10);
    expect(got.filter((c) => c === 'LOCKED')).toHaveLength(30);
    fails(await invites.redeemInvite({ code }), 'LOCKED');

    as((await newcomer()).id);
    expect(ok(await invites.redeemInvite({ code }))).toEqual({ status: 'ACTIVE' });
    as('u_admin');
    expect(ok(await notifications.listForUser()).filter((x) => x.type === 'INVITE_GUESSING')).toEqual([]);
  });

  it('two accounts sending the same right code at once: one joins, the other stays in preview, the child is made once', async () => {
    const code = await invite();
    const two = [await newcomer(), await newcomer()];
    // Who is signed in is read as each call starts, so the two calls can overlap.
    as(two[0].id);
    const first = invites.redeemInvite({ code });
    as(two[1].id);
    const results = await Promise.all([first, invites.redeemInvite({ code })]);
    expect(results.map((r) => (r.ok ? 'OK' : r.code)).sort()).toEqual(['INVALID_CODE', 'OK']);
    expect(await db.student.count({ where: { firstName: 'Holdoutkid' } })).toBe(1);
    expect(await db.user.count({ where: { id: { in: two.map((u) => u.id) }, status: 'ACTIVE' } })).toBe(1);
  });

  it('the clean-up does nothing on an empty table, and keeps tries under a day old', async () => {
    await db.redeemFailure.deleteMany();
    expect((await cleanUp()).redeemFailures).toBe(0);
    const g = await newcomer();
    const at = (hours: number) => ({ userId: g.id, at: new Date(Date.now() - hours * HOUR) });
    await db.redeemFailure.createMany({ data: [at(0), at(0.5), at(23), at(25), at(24 * 30)] });
    expect((await cleanUp()).redeemFailures).toBe(2);
    expect(await db.redeemFailure.count()).toBe(3);
  });
});
