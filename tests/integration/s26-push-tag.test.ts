/**
 * S26: a push's tag names what it's about, so a newer push replaces only an older one about the
 * same thing. Real server actions against Postgres; only web-push is a fake, so the test reads
 * the exact payload Vienne's phone would get.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as assignments from '@/server/assignments';
import * as families from '@/server/families';
import * as messages from '@/server/messages';
import * as notifications from '@/server/notifications';

const sendNotification = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public';
  process.env.VAPID_PRIVATE_KEY = 'test-private';
  return vi.fn(async (_sub: { endpoint: string }, _body: string) => ({}));
});
vi.mock('web-push', () => ({ sendNotification, setVapidDetails: vi.fn() }));

freshDemo();

const VIENNE = 'https://fcm.googleapis.com/fcm/send/s26-vienne';

/** The tags of the pushes Vienne's phone got since the last reset, once `count` have arrived. */
async function tags(count: number) {
  await vi.waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(count));
  return sendNotification.mock.calls.map(([sub, body]) => {
    expect(sub.endpoint).toBe(VIENNE);
    return (JSON.parse(body) as { tag?: string }).tag;
  });
}

beforeAll(async () => {
  as('u_admin');
  ok(await notifications.savePushSubscription({ endpoint: VIENNE, keys: { p256dh: 'p', auth: 'a' } }));
});

beforeEach(() => sendNotification.mockClear());

describe('S26: push tags', () => {
  it('two families’ messages give two tags', async () => {
    as('u_ana');
    ok(await messages.sendMessage({ body: 'Mateo has a game Thursday' }));
    as('u_grace');
    ok(await messages.sendMessage({ body: 'Noah loved today' }));
    const [ana, grace] = await tags(2);
    expect(ana).toBeTruthy();
    expect(grace).toBeTruthy();
    expect(grace).not.toBe(ana);
  });

  it('two messages in one thread give one tag', async () => {
    as('u_ana');
    ok(await messages.sendMessage({ body: 'One more thing' }));
    ok(await messages.sendMessage({ body: 'And another' }));
    const [first, second] = await tags(2);
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('two families’ handed-in work gives two tags, even for the same assignment', async () => {
    as('u_admin');
    // #1–12 has no written answers, so it hands in without photos.
    const a = ok(await assignments.createBookAssignment({ bookId: 'book_g3', test: 'T2', from: 1, to: 12, studentIds: ['s_mateo', 's_jordan'] }));
    const key = await db.bookItem.findMany({ where: { bookId: 'book_g3', test: 'T2', number: { lte: 12 } }, orderBy: { number: 'asc' } });
    expect(key.some((k) => k.format === 'OPEN')).toBe(false);
    const answers = key.map((k) => ({ number: k.number, value: k.answer }));
    sendNotification.mockClear();

    for (const [parent, student] of [['u_ana', 's_mateo'], ['u_keisha', 's_jordan']]) {
      as(parent);
      const sub = await db.submission.findFirstOrThrow({ where: { assignmentId: a.id, studentId: student } });
      ok(await assignments.submitAnswerSheet({ submissionId: sub.id, answers }));
    }
    const [mateo, jordan] = await tags(2);
    expect(mateo).toBeTruthy();
    expect(jordan).toBeTruthy();
    expect(jordan).not.toBe(mateo);
  });

  it('a tag names the record, not the words: two children called Mateo get their own tags', async () => {
    as('u_admin');
    const other = ok(await families.addStudent({ parentId: 'u_grace', firstName: 'Mateo', grade: 3 }));
    const a = ok(await assignments.createBookAssignment({ bookId: 'book_g3', test: 'T2', from: 1, to: 1, studentIds: ['s_mateo', other.id] }));
    const subs = await db.submission.findMany({ where: { assignmentId: a.id }, select: { id: true, studentId: true } });
    const subOf = (studentId: string) => subs.find((s) => s.studentId === studentId)!.id;
    sendNotification.mockClear();
    for (const [parent, student] of [['u_ana', 's_mateo'], ['u_grace', other.id]]) {
      as(parent);
      ok(await assignments.submitAnswerSheet({ submissionId: subOf(student), answers: [{ number: 1, value: 'A' }] }));
    }
    expect(await tags(2)).toEqual([`SUBMISSION_RECEIVED:${subOf('s_mateo')}`, `SUBMISSION_RECEIVED:${subOf(other.id)}`]);

    sendNotification.mockClear();
    as('u_grace');
    ok(await messages.sendMessage({ body: 'Mateo is new here' }));
    const thread = await db.conversation.findUniqueOrThrow({ where: { parentId: 'u_grace' } });
    expect(await tags(1)).toEqual([`thread:${thread.id}`]);
  });

  it('a parent can’t hand in another family’s work, and nothing is pushed', async () => {
    as('u_admin');
    const a = ok(await assignments.createBookAssignment({ bookId: 'book_g3', test: 'T2', from: 1, to: 12, studentIds: ['s_mateo'] }));
    const sub = await db.submission.findFirstOrThrow({ where: { assignmentId: a.id, studentId: 's_mateo' } });
    sendNotification.mockClear();
    as('u_keisha');
    const r = await assignments.submitAnswerSheet({ submissionId: sub.id, answers: [{ number: 1, value: 'A' }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['FORBIDDEN', 'NOT_FOUND']).toContain(r.code);
    as(null);
    fails(await messages.sendMessage({ body: 'hi' }), 'UNAUTHENTICATED');
    await new Promise((done) => setTimeout(done, 50));
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
