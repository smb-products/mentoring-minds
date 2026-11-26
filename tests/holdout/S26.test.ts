/**
 * S26 holdouts, through the real actions: on Vienne's phone a second family's cancellation or handed-in
 * work has its own tag, even when the two children share a first name.
 */
import { describe, expect, it, vi } from 'vitest';
import { as, db, freshDemo, ok, upcomingSession } from '../integration/helpers';
import * as assignments from '@/server/assignments';
import * as families from '@/server/families';
import * as invites from '@/server/invites';
import * as notifications from '@/server/notifications';
import * as reports from '@/server/reports';
import * as scheduling from '@/server/scheduling';
import { sendSessionReminders } from '@/lib/jobs';

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

  it('two families’ session requests, and two parents of one name joining, each show on their own', async () => {
    await subscribe('u_admin', 'vienne');
    const requests = await pushesTo('vienne', 2, async () => {
      for (const [parentId, studentId] of [['u_ana', 's_mateo'], ['u_grace', 's_noah']]) {
        as(parentId);
        const from = new Date(Date.now() + 3 * 86400000).toISOString();
        const to = new Date(Date.now() + 24 * 86400000).toISOString();
        const open = ok(await scheduling.getOpenSlots({ durationMin: 60, mode: 'VIDEO', from, to }));
        const startsAt = open[0].startsAt;
        ok(await scheduling.requestSession({ studentId, mode: 'VIDEO', startsAt, durationMin: 60 }));
      }
    });
    expect(new Set(requests.map((p) => p.tag)).size).toBe(2);

    const joined = await pushesTo('vienne', 2, async () => {
      for (const parentId of ['u_tom', 'u_lena']) {
        await db.user.update({ where: { id: parentId }, data: { name: 'Sam Lee' } });
        as('u_admin');
        const { code } = ok(await invites.createInvite({ parentName: 'Sam Lee', plannedStudents: [{ firstName: 'Mateo', grade: 3 }] }));
        as(parentId);
        ok(await invites.redeemInvite({ code }));
      }
    });
    expect(joined[1].title).toBe(joined[0].title);
    expect(new Set(joined.map((p) => p.tag)).size).toBe(2);
  });

  it('reports and reminders get one tag per record, only on the owner’s phone, and the feed gains nothing', async () => {
    await subscribe('u_ana', 'ana');
    await subscribe('u_grace', 'grace');
    as('u_admin');
    const skill = await db.skill.findFirstOrThrow();
    const published = await pushesTo('ana', 2, async () => {
      for (const studentId of ['s_mateo', 's_lucia']) {
        const draft = ok(await reports.createDraft({ studentId }));
        ok(await reports.updateReport({ reportId: draft.id, summary: 'S26 summary' }));
        ok(await reports.setRatings({ reportId: draft.id, ratings: [{ skillId: skill.id, rating: 3 }] }));
        ok(await reports.publishReport({ reportId: draft.id }));
      }
    });
    expect(new Set(published.map((p) => p.tag)).size).toBe(2);
    expect(sendNotification.mock.calls.filter((c) => c[0].endpoint === device('grace'))).toHaveLength(0);

    const mine = [await upcomingSession({ studentId: 's_mateo' }), await upcomingSession({ studentId: 's_lucia' })];
    await db.session.updateMany({ data: { reminderSentAt: new Date() } });
    for (const [i, s] of mine.entries()) {
      const startsAt = new Date(Date.now() + (2 + i * 2) * 3600000);
      await db.session.update({ where: { id: s.id }, data: { status: 'CONFIRMED', reminderSentAt: null, startsAt, endsAt: new Date(startsAt.getTime() + 3600000) } });
    }
    const reminders = await pushesTo('ana', 2, async () => {
      expect(await sendSessionReminders()).toBe(2);
    });
    expect(new Set(reminders.map((p) => p.tag)).size).toBe(2);

    // One session moved twice: the newer push replaces the older one.
    const moves = await pushesTo('ana', 2, async () => {
      as('u_admin');
      for (const days of [60, 61]) {
        ok(await scheduling.rescheduleSession({ sessionId: mine[0].id, startsAt: new Date(Date.now() + days * 86400000).toISOString() }));
      }
    });
    expect(moves[0].tag).toBeTruthy();
    expect(moves[1].tag).toBe(moves[0].tag);

    // The record id only names the push: the feed carries nothing new.
    as('u_ana');
    const feed = ok(await notifications.listForUser());
    expect(feed.length).toBeGreaterThan(0);
    const keys = ['id', 'userId', 'audience', 'type', 'title', 'body', 'href', 'channel', 'sentAt', 'readAt', 'createdAt'];
    expect(feed.flatMap((row) => Object.keys(row)).filter((k) => !keys.includes(k))).toEqual([]);

    // Another parent, a PREVIEW parent or nobody can't cancel it, and no phone buzzes.
    sendNotification.mockClear();
    for (const actor of ['u_grace', 'u_tom', null]) {
      as(actor);
      expect((await scheduling.cancelSession({ sessionId: mine[1].id })).ok).toBe(false);
    }
    await new Promise((done) => setTimeout(done, 100));
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
