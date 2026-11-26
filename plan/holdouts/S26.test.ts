/**
 * S26 holdouts, through the real actions: on Vienne's phone a second family's cancellation or handed-in
 * work has its own tag, even when the two children share a first name.
 */
import { describe, expect, it, vi } from 'vitest';
import { as, db, freshDemo, ok, upcomingSession } from '../../tests/integration/helpers';
import * as assignments from '@/server/assignments';
import * as families from '@/server/families';
import * as notifications from '@/server/notifications';
import * as scheduling from '@/server/scheduling';

const sendNotification = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public';
  process.env.VAPID_PRIVATE_KEY = 'test-private';
  return vi.fn(async (_sub: { endpoint: string }, _body: string) => ({}));
});
vi.mock('web-push', () => ({ sendNotification, setVapidDetails: vi.fn() }));

freshDemo();

const device = (who: string) => `https://fcm.googleapis.com/fcm/send/s26-${who}`;
const subscribe = async (userId: string, who: string) => {
  as(userId);
  ok(await notifications.savePushSubscription({ endpoint: device(who), keys: { p256dh: 'p', auth: 'a' } }));
};
/** The pushes one device got while `act` ran. */
async function pushesTo(who: string, count: number, act: () => Promise<void>) {
  sendNotification.mockClear();
  await act();
  const mine = () => sendNotification.mock.calls.filter((c) => c[0].endpoint === device(who)).map((c) => JSON.parse(c[1]) as { title: string; tag: string; href: string });
  await vi.waitFor(() => expect(mine()).toHaveLength(count));
  return mine();
}

describe('S26 holdouts', () => {
  it('a parent’s phone shows two children’s homework side by side', async () => {
    await subscribe('u_ana', 'ana');
    as('u_admin');
    const got = await pushesTo('ana', 2, async () => {
      ok(await assignments.createPracticeAssignment({ title: 'S26 reading', studentIds: ['s_mateo', 's_lucia'] }));
    });
    expect(new Set(got.map((p) => p.tag)).size).toBe(2);
  });

  it('two families’ cancellations show side by side on Vienne’s phone', async () => {
    await subscribe('u_admin', 'vienne');
    const got = await pushesTo('vienne', 2, async () => {
      for (const parentId of ['u_ana', 'u_grace']) {
        const s = await upcomingSession({ parentId, minHoursAway: 48 });
        as(parentId);
        ok(await scheduling.cancelSession({ sessionId: s.id, reason: 'S26' }));
      }
    });
    expect(new Set(got.map((p) => p.tag)).size).toBe(2);
  });

  it('two families’ handed-in work shows side by side, even when both children are called Mateo', async () => {
    await subscribe('u_admin', 'vienne');
    as('u_admin');
    const other = ok(await families.addStudent({ parentId: 'u_grace', firstName: 'Mateo', grade: 3 }));
    const a = ok(await assignments.createBookAssignment({ bookId: 'book_g3', test: 'T2', from: 1, to: 1, studentIds: ['s_mateo', other.id] }));
    const got = await pushesTo('vienne', 2, async () => {
      for (const [parentId, studentId] of [['u_ana', 's_mateo'], ['u_grace', other.id]]) {
        const sub = await db.submission.findFirstOrThrow({ where: { assignmentId: a.id, studentId } });
        as(parentId);
        ok(await assignments.submitAnswerSheet({ submissionId: sub.id, answers: [{ number: 1, value: 'A' }] }));
      }
    });
    expect(got[1].tag, `both tagged ${got[0].tag}`).not.toBe(got[0].tag);
  });
});
