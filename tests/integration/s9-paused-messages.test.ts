/**
 * S9: a paused parent can open Messages and write to Vienne (the paused notice tells them to),
 * and nothing else opens for them. A preview parent and a signed-out caller are still refused.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as assignments from '@/server/assignments';
import * as books from '@/server/books';
import * as content from '@/server/content';
import * as dashboard from '@/server/dashboard';
import * as families from '@/server/families';
import * as fast from '@/server/fast';
import * as invites from '@/server/invites';
import * as messages from '@/server/messages';
import * as notifications from '@/server/notifications';
import * as reports from '@/server/reports';
import * as scheduling from '@/server/scheduling';
import * as taxonomy from '@/server/taxonomy';

freshDemo();

type Fn = (input: never) => Promise<{ ok: boolean; code?: string }>;
const call = (fn: unknown, input: unknown = {}) => (fn as Fn)(input as never);
const setStatus = (id: string, status: 'ACTIVE' | 'PAUSED' | 'PREVIEW') => db.user.update({ where: { id }, data: { status } });

afterEach(async () => {
  await setStatus('u_daniel', 'ACTIVE');
});

describe('a paused parent and Messages', () => {
  it('reads their own thread and sends Vienne a message; she gets it and the alert, as from an active parent', async () => {
    await setStatus('u_daniel', 'PAUSED');
    as('u_daniel');
    const thread = ok(await messages.getThread());
    expect(thread.parentId).toBe('u_daniel');
    expect(thread.messages.length).toBeGreaterThan(0);
    expect(thread.messages.every((m) => m.conversationId === thread.id)).toBe(true);

    const body = 'S9: please turn our account back on, we are ready to start again.';
    const sent = ok(await messages.sendMessage({ body }));
    expect(sent.conversationId).toBe(thread.id);
    expect(ok(await messages.getThread()).messages.at(-1)?.body).toBe(body);

    const alert = await db.notification.findFirstOrThrow({ where: { userId: 'u_admin', type: 'MESSAGE_RECEIVED', body: body.slice(0, 80) } });
    expect(alert).toMatchObject({ audience: 'ADMIN', title: 'Daniel Reyes sent a message', href: `/admin/messages/${thread.id}` });

    as('u_admin');
    const vienne = ok(await messages.getThread({ conversationId: thread.id }));
    expect(vienne.messages.at(-1)).toMatchObject({ body, senderId: 'u_daniel' });
    expect(ok(await messages.listThreads()).find((t) => t.id === thread.id)?.unread).toBeGreaterThan(0);
  });

  it('a conversationId that isn’t theirs gives them their own thread (permission)', async () => {
    const graces = await db.conversation.findUniqueOrThrow({ where: { parentId: 'u_grace' } });
    const before = await db.message.count({ where: { conversationId: graces.id } });
    await setStatus('u_daniel', 'PAUSED');
    as('u_daniel');
    const mine = ok(await messages.getThread({ conversationId: graces.id }));
    expect(mine.parentId).toBe('u_daniel');
    expect(mine.messages.every((m) => m.conversationId === mine.id)).toBe(true);
    expect(JSON.stringify(mine)).not.toContain('Noah');
    const sent = ok(await messages.sendMessage({ conversationId: graces.id, body: 'Hello from a paused family' }));
    expect(sent.conversationId).toBe(mine.id);
    expect(await db.message.count({ where: { conversationId: graces.id } })).toBe(before);
    fails(await messages.listThreads(), 'FORBIDDEN');
  });

  it('a preview parent still gets NOT_ACTIVE from both, and signed out gets UNAUTHENTICATED', async () => {
    const before = await db.message.count();
    as('u_tom');
    fails(await messages.getThread(), 'NOT_ACTIVE', /invite code/);
    fails(await messages.sendMessage({ body: 'Hi' }), 'NOT_ACTIVE', /invite code/);
    as(null);
    fails(await messages.getThread(), 'UNAUTHENTICATED');
    fails(await messages.sendMessage({ body: 'Hi' }), 'UNAUTHENTICATED');
    expect(await db.message.count()).toBe(before);
  });

  it('the rest of a paused parent’s account stays locked', async () => {
    await setStatus('u_daniel', 'PAUSED');
    as('u_daniel');
    fails(await dashboard.getParentOverview({ studentId: 's_sofia' }), 'NOT_ACTIVE');
    fails(await assignments.listForStudent({ studentId: 's_sofia' }), 'NOT_ACTIVE');
    fails(await content.createUpload({ filename: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 100 }), 'NOT_ACTIVE');
    fails(await scheduling.requestSession({ studentId: 's_sofia', mode: 'VIDEO', startsAt: new Date(Date.now() + 3 * 86400000).toISOString(), durationMin: 45 }), 'NOT_ACTIVE');
  });
});

/**
 * Before S9, PAUSED and PREVIEW went through the same requireActive. So every other function must still
 * refuse a paused parent exactly where it refuses a preview one. Last in the file: it calls everything.
 */
describe('every other function answers a paused parent as before', () => {
  const modules = { assignments, books, content, dashboard, families, fast, invites, messages, notifications, reports, scheduling, taxonomy };
  const OPENED = new Set(['messages.getThread', 'messages.sendMessage']);

  it('NOT_ACTIVE for a paused parent wherever a preview parent gets it, except the two Messages functions', async () => {
    await setStatus('u_daniel', 'PAUSED');
    const notActive: string[] = [];
    const mismatched: string[] = [];
    for (const [area, mod] of Object.entries(modules)) {
      for (const [name, fn] of Object.entries(mod)) {
        if (typeof fn !== 'function') continue;
        const key = `${area}.${name}`;
        const input = { studentId: 's_sofia', parentId: 'u_daniel' };
        as('u_tom');
        const preview = await call(fn, input);
        if (preview.ok || preview.code !== 'NOT_ACTIVE') continue;
        notActive.push(key);
        as('u_daniel');
        const paused = await call(fn, input);
        const expected = OPENED.has(key) ? 'not refused' : 'NOT_ACTIVE';
        const got = !paused.ok && paused.code === 'NOT_ACTIVE' ? 'NOT_ACTIVE' : 'not refused';
        if (got !== expected) mismatched.push(`${key}: ${got}`);
      }
    }
    expect(notActive).toEqual(expect.arrayContaining([...OPENED, 'dashboard.getParentOverview', 'assignments.listForStudent']));
    expect(notActive.length).toBeGreaterThan(10);
    expect(mismatched).toEqual([]);
  });
});
