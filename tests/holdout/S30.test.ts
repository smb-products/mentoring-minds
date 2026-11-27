/** S30 holdouts: who sees the joined alert, what it carries, and what is left once every child is gone. Made-up families only. */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, ok } from '../integration/helpers';
import * as families from '@/server/families';
import * as invites from '@/server/invites';
import * as notifications from '@/server/notifications';

const sendNotification = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public';
  process.env.VAPID_PRIVATE_KEY = 'test-private';
  return vi.fn(async (_sub: unknown, _body: string) => ({}));
});
vi.mock('web-push', () => ({ sendNotification, setVapidDetails: vi.fn() }));

freshDemo();

const KIDS = [
  { firstName: 'Xiomara', lastName: 'Quill', grade: 1, school: 'Holdout Elementary' },
  { firstName: 'Anne-Sophie', grade: 3 },
  { firstName: 'Zeferino', grade: 6 },
];
// Whole words: the feed's own field names (“channel”) mustn't count as “Anne”.
const CHILD_DETAILS = /\b(Xiomara|Anne|Sophie|Zeferino|Holdout Elementary)\b/i;
let parentId: string;
let code: string;

beforeAll(async () => {
  as('u_admin');
  ok(await notifications.savePushSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/s30-holdout', keys: { p256dh: 'p', auth: 'a' } }));
  const made = ok(await invites.createInvite({ parentName: 'Delphine Quill', plannedStudents: KIDS }));
  code = made.code;
  const parent = await db.user.create({ data: { email: 's30.holdout@example.com', name: 'Delphine Quill', role: 'PARENT', status: 'PREVIEW', emailVerified: new Date() } });
  parentId = parent.id;
  as(parentId);
  ok(await invites.redeemInvite({ code }));
});

const joined = async () => {
  as('u_admin');
  return ok(await notifications.listForUser()).filter((a) => a.title === 'Delphine Quill joined');
};

describe('S30 holdouts', () => {
  it('Vienne’s feed and phone get the count, with no child, school or code anywhere in them', async () => {
    const [alert, ...more] = await joined();
    expect(more).toEqual([]);
    expect(alert.body).toBe('Invite code used. 3 children added.');
    expect(JSON.stringify(alert)).not.toMatch(CHILD_DETAILS);
    expect(JSON.stringify(alert)).not.toContain(code);
    await vi.waitFor(() => expect(sendNotification).toHaveBeenCalled());
    const pushes = sendNotification.mock.calls.map(([, body]) => body);
    expect(pushes).toHaveLength(1);
    expect(JSON.parse(pushes[0])).toMatchObject({ title: 'Delphine Quill joined', body: 'Invite code used. 3 children added.' });
    expect(pushes[0]).not.toMatch(CHILD_DETAILS);
    expect(pushes[0]).not.toContain(code);
  });

  it('no family sees the joined alert, signed out is refused, and a used or wrong code makes no second one', async () => {
    for (const who of ['u_ana', 'u_grace', 'u_tom', parentId]) {
      as(who);
      expect(JSON.stringify(ok(await notifications.listForUser())), who).not.toMatch(/Delphine|Xiomara|Zeferino/);
    }
    as(null);
    fails(await notifications.listForUser(), 'UNAUTHENTICATED');
    as('u_tom');
    fails(await invites.redeemInvite({ code }), 'INVALID_CODE');
    fails(await invites.redeemInvite({ code: 'ZZZZ-ZZZZ' }), 'INVALID_CODE');
    expect(await joined()).toHaveLength(1);
  });

  it('once every child is deleted, nothing left in Vienne’s feed names any of them', async () => {
    as('u_admin');
    for (const s of await db.student.findMany({ where: { parentId }, select: { id: true } })) ok(await families.deleteStudent({ studentId: s.id }));
    expect(await db.student.count({ where: { parentId } })).toBe(0);
    expect(await joined()).toHaveLength(1);
    expect(JSON.stringify(ok(await notifications.listForUser()))).not.toMatch(CHILD_DETAILS);
  });
});
