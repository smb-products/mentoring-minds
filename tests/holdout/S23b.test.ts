/**
 * S23b holdouts: two families that look the same (parent name, child names, shared homework), with every
 * alert made by the app's own actions. Deleting one takes all of its alerts and nothing of the twin's.
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from '../integration/helpers';
import * as assignments from '@/server/assignments';
import * as families from '@/server/families';
import * as invites from '@/server/invites';
import * as messages from '@/server/messages';
import * as notifications from '@/server/notifications';
import * as scheduling from '@/server/scheduling';

freshDemo();

const DAY = 86400000;

/** A new parent who redeems a code Vienne made. `kids` is in the order the children were typed. */
async function join(email: string, firstNames: string[]) {
  as('u_admin');
  const code = ok(
    await invites.createInvite({
      parentName: 'Dana Twin',
      parentEmail: email,
      plannedStudents: firstNames.map((firstName) => ({ firstName, lastName: 'Twin', grade: 3 })),
    }),
  );
  const parent = await db.user.create({ data: { email, name: 'Dana Twin', role: 'PARENT', status: 'PREVIEW', emailVerified: new Date() } });
  as(parent.id);
  ok(await invites.redeemInvite({ code: code.code }));
  const kids = await db.student.findMany({ where: { parentId: parent.id } });
  return { id: parent.id, inviteId: code.invite.id, kids };
}
type Family = Awaited<ReturnType<typeof join>>;

const feed = async (userId: string) => {
  as(userId);
  return ok(await notifications.listForUser());
};
const alertIds = async () => (await db.notification.findMany({ select: { id: true } })).map((n) => n.id).sort();
/** Runs real actions and returns the ids of the alerts they made. */
async function alertsFrom(run: () => Promise<void>) {
  const before = new Set(await alertIds());
  await run();
  return (await alertIds()).filter((i) => !before.has(i));
}

/** Homework handed in and returned, a booking Vienne makes and the parent cancels, and a message. */
async function activity(parentId: string, studentId: string, assignmentId: string, daysAhead: number) {
  const work = await db.submission.findFirstOrThrow({ where: { assignmentId, studentId } });
  as(parentId);
  const key = await db.bookItem.findMany({ where: { bookId: 'book_g3', test: 'T2', number: { lte: 4 } } });
  as(parentId);
  ok(await assignments.submitAnswerSheet({ submissionId: work.id, answers: key.map((k) => ({ number: k.number, value: k.answer })) }));
  as('u_admin');
  ok(await assignments.returnSubmission({ submissionId: work.id, feedback: 'Try number 2 again.' }));
  const startsAt = new Date(Math.floor(Date.now() / DAY) * DAY + daysAhead * DAY + 15 * 3600000).toISOString();
  const session = ok(await scheduling.createSessionAsAdmin({ studentId, mode: 'VIDEO', startsAt, durationMin: 60, meetingUrl: 'https://meet.example.com/twin' }));
  as(parentId);
  ok(await scheduling.cancelSession({ sessionId: session.id, reason: 'We are away.' }));
  ok(await messages.sendMessage({ body: 'Hello from the Twin family.' }));
}

describe('S23b holdouts: look-alikes', () => {
  it('deleting one of two look-alike families takes every alert of its own and leaves the twin, its code, feed and shared homework as they were', async () => {
    let a!: Family;
    let b!: Family;
    const ofA = await alertsFrom(async () => void (a = await join('dana_t@example.com', ['Robin'])));
    const ofB = await alertsFrom(async () => void (b = await join('danaxt@example.com', ['Robin'])));

    // One assignment given to both Robins.
    let shared!: string;
    const given = await alertsFrom(async () => {
      as('u_admin');
      shared = ok(await assignments.createBookAssignment({ bookId: 'book_g3', test: 'T2', from: 1, to: 4, studentIds: [a.kids[0].id, b.kids[0].id] })).id;
    });
    ofA.push(...(await alertsFrom(() => activity(a.id, a.kids[0].id, shared, 40))));
    ofB.push(...(await alertsFrom(() => activity(b.id, b.kids[0].id, shared, 41))));
    for (const n of await db.notification.findMany({ where: { id: { in: given } } })) (n.userId === a.id ? ofA : ofB).push(n.id);
    // joined, given, handed in, returned, booked, cancelled, message
    expect(ofA).toHaveLength(7);
    expect(ofB).toHaveLength(7);

    const twin = async () => ({
      parent: await db.user.findUnique({ where: { id: b.id } }),
      kids: await db.student.findMany({ where: { parentId: b.id } }),
      code: await db.invite.findUnique({ where: { id: b.inviteId } }),
      work: await db.submission.findMany({ where: { studentId: b.kids[0].id } }),
      sessions: await db.session.findMany({ where: { studentId: b.kids[0].id } }),
      thread: await db.conversation.findUnique({ where: { parentId: b.id }, include: { messages: true } }),
      alerts: await db.notification.findMany({ where: { id: { in: ofB } }, orderBy: { id: 'asc' } }),
      feed: await feed(b.id),
    });
    const before = await twin();
    const others = (await alertIds()).filter((i) => !ofA.includes(i));

    as('u_admin');
    ok(await families.deleteFamily({ parentId: a.id }));

    expect(await twin()).toEqual(before);
    expect(await alertIds(), 'exactly the deleted family’s alerts are gone').toEqual(others);
    expect(await db.assignment.findUnique({ where: { id: shared } })).not.toBeNull();
    expect(await db.invite.findUnique({ where: { id: a.inviteId } })).toBeNull();
    // The deleted parent, still signed in on a phone, gets nothing.
    as(a.id);
    fails(await notifications.listForUser(), 'UNAUTHENTICATED');
  });

  it('two siblings typed with the same name: deleting one takes only that one off the redeemed code, and no feed carries a family or child link', async () => {
    const c = await join('sam.twins@example.com', ['Sam', 'Sam']);
    const [first, second] = c.kids;
    as('u_admin');
    ok(await assignments.createPracticeAssignment({ title: 'For both Sams', studentIds: [first.id, second.id] }));
    for (const who of [c.id, 'u_admin']) {
      const rows = await feed(who);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(Object.keys(row)).not.toContain('studentId');
        expect(Object.keys(row)).not.toContain('parentId');
      }
    }
    as('u_admin');
    ok(await families.deleteStudent({ studentId: first.id }));
    const code = await db.invite.findUniqueOrThrow({ where: { id: c.inviteId } });
    expect((code.plannedStudents as { studentId: string }[]).map((p) => p.studentId)).toEqual([second.id]);
    expect(await db.notification.count({ where: { userId: c.id } }), 'the other Sam’s alert stays').toBe(1);
    expect(await db.submission.count({ where: { studentId: second.id } })).toBe(1);
  });
});
