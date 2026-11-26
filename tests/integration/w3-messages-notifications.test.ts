/**
 * W3: messages and alerts as the screens use them, and this device's push subscription
 * (the "Turn on notifications" button and Sign out, src/ui/components/messages/push.js)
 * driven against the real savePushSubscription / removePushSubscription.
 */
import { describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as messages from '@/server/messages';
import * as notifications from '@/server/notifications';
import { forgetPush, keyBytes, needsHomeScreen, pushOffer, turnOnPush } from '@/ui/components/messages/push';

freshDemo();

const KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';

describe('messages', () => {
  it('a parent’s message lands in their own thread and alerts Vienne with a link to it', async () => {
    as('u_ana');
    const sent = ok(await messages.sendMessage({ body: 'Can Mateo bring his book on Monday?' }));
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: sent.conversationId } });
    expect(conv.parentId).toBe('u_ana');
    const alert = await db.notification.findFirstOrThrow({ where: { userId: 'u_admin', title: 'Ana Mendoza sent a message' }, orderBy: { createdAt: 'desc' } });
    expect(alert.href).toBe(`/admin/messages/${conv.id}`);

    as('u_admin');
    expect(ok(await messages.getThread({ conversationId: conv.id })).messages.map((m) => m.body)).toContain('Can Mateo bring his book on Monday?');
    ok(await messages.sendMessage({ conversationId: conv.id, body: 'Yes, please bring it.' }));
    as('u_ana');
    expect(ok(await messages.getThread()).messages.at(-1)?.body).toBe('Yes, please bring it.');
  });

  it('Vienne opening a thread marks it read up to its last message', async () => {
    const conv = await db.conversation.findUniqueOrThrow({ where: { parentId: 'u_daniel' } });
    as('u_admin');
    ok(await messages.markThreadRead({ conversationId: conv.id }));
    const after = await db.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(after.adminLastReadAt!.getTime()).toBeGreaterThanOrEqual(conv.lastMessageAt.getTime());
    expect(ok(await messages.listThreads()).find((t) => t.id === conv.id)?.unread).toBe(0);
  });

  it('a parent only ever gets their own thread (permission)', async () => {
    const daniels = await db.conversation.findUniqueOrThrow({ where: { parentId: 'u_daniel' } });
    as('u_grace');
    const mine = ok(await messages.getThread({ conversationId: daniels.id }));
    expect(mine.parentId).toBe('u_grace');
    expect(mine.messages.every((m) => m.conversationId === mine.id)).toBe(true);
    fails(await messages.listThreads(), 'FORBIDDEN');
    const sent = ok(await messages.sendMessage({ conversationId: daniels.id, body: 'Hello' }));
    expect(sent.conversationId).toBe(mine.id);
  });
});

describe('alerts', () => {
  it('Mark all as read clears only the caller’s alerts', async () => {
    as('u_ana');
    ok(await messages.sendMessage({ body: 'One more question' }));
    await db.notification.create({ data: { userId: 'u_ana', audience: 'PARENT', type: 'REPORT_PUBLISHED', title: 'A report for Ana' } });
    as('u_admin');
    expect(await db.notification.count({ where: { userId: 'u_admin', readAt: null } })).toBeGreaterThan(0);
    ok(await notifications.markAllRead());
    expect(await db.notification.count({ where: { userId: 'u_admin', readAt: null } })).toBe(0);
    expect(await db.notification.count({ where: { userId: 'u_ana', readAt: null } })).toBeGreaterThan(0);
  });

  it('a parent can’t mark someone else’s alert read (permission)', async () => {
    const theirs = await db.notification.create({ data: { userId: 'u_admin', audience: 'ADMIN', type: 'MESSAGE_RECEIVED', title: 'For Vienne' } });
    as('u_ana');
    ok(await notifications.markRead({ notificationId: theirs.id }));
    expect((await db.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull();
    expect(ok(await notifications.listForUser()).every((n) => n.userId === 'u_ana')).toBe(true);
  });
});

/** A browser with a service worker and PushManager; `subscribed` is this device's subscription, if any. */
function device({ registered = true, pushManager = true, subscribed = false, userAgent = 'Mozilla/5.0 (Test phone)' } = {}) {
  const endpoint = `https://fcm.googleapis.com/fcm/send/${Math.random().toString(36).slice(2)}`;
  const sub = {
    endpoint,
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: KEY, auth: 'tBHItJI5svbpez7KI4CCXg' } }),
    unsubscribe: vi.fn(async () => true),
  };
  const state = { current: subscribed ? sub : null };
  const manager = {
    getSubscription: vi.fn(async () => state.current),
    subscribe: vi.fn(async () => (state.current = sub)),
  };
  const reg = { pushManager: manager };
  const win: Record<string, unknown> = {
    navigator: { userAgent, serviceWorker: { getRegistration: async () => (registered ? reg : undefined), ready: Promise.resolve(reg) } },
  };
  if (pushManager) win.PushManager = function PushManager() {};
  return { win, sub, manager, endpoint };
}

describe('Turn on notifications', () => {
  it('is offered only with a key, PushManager, a service worker, and no subscription yet; never asks to', async () => {
    expect(await pushOffer({ key: KEY, win: device().win })).toBe('offer');
    expect(await pushOffer({ key: '', win: device().win })).toBe('hidden');
    expect(await pushOffer({ key: KEY, win: device({ pushManager: false }).win })).toBe('hidden');
    expect(await pushOffer({ key: KEY, win: device({ registered: false }).win })).toBe('hidden');
    expect(await pushOffer({ key: KEY, win: device({ subscribed: true }).win })).toBe('hidden');
    expect(await pushOffer({ key: KEY, win: { navigator: {} } })).toBe('hidden');
    const d = device();
    await pushOffer({ key: KEY, win: d.win });
    expect(d.manager.subscribe).not.toHaveBeenCalled();
  });

  it('subscribes with the VAPID key and saves subscription.toJSON() plus the user agent', async () => {
    as('u_ana');
    const d = device();
    const r = await turnOnPush({ key: KEY, save: notifications.savePushSubscription, win: d.win });
    expect(r.ok).toBe(true);
    expect(d.manager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) });
    expect(keyBytes(KEY)).toHaveLength(65);
    const row = await db.pushSubscription.findUniqueOrThrow({ where: { endpoint: d.endpoint } });
    expect(row).toMatchObject({ userId: 'u_ana', p256dh: KEY, auth: 'tBHItJI5svbpez7KI4CCXg', userAgent: 'Mozilla/5.0 (Test phone)' });
    expect(await pushOffer({ key: KEY, win: d.win })).toBe('hidden');
  });

  it('says so in plain words when the browser blocks it, and unsubscribes again when saving fails', async () => {
    const blocked = device();
    blocked.manager.subscribe.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    const r = await turnOnPush({ key: KEY, save: notifications.savePushSubscription, win: blocked.win });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/browser’s settings/) });

    as(null); // signed out: the server refuses, and the device doesn't stay subscribed
    const d = device();
    fails(await turnOnPush({ key: KEY, save: notifications.savePushSubscription, win: d.win }), 'UNAUTHENTICATED');
    expect(d.sub.unsubscribe).toHaveBeenCalled();
    expect(await db.pushSubscription.findUnique({ where: { endpoint: d.endpoint } })).toBeNull();
  });

  it('points iPhone users to the Home Screen instead of showing an error', () => {
    const iphone = (extra: Record<string, unknown> = {}) => ({ navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }, ...extra });
    expect(needsHomeScreen(iphone())).toBe(true);
    expect(needsHomeScreen(iphone({ PushManager: function PushManager() {} }))).toBe(false);
    expect(needsHomeScreen(device().win)).toBe(false);
  });
});

describe('Sign out forgets this device', () => {
  it('removes the subscription on the server and in the browser', async () => {
    as('u_ana');
    const d = device();
    ok(await turnOnPush({ key: KEY, save: notifications.savePushSubscription, win: d.win }));
    await forgetPush({ remove: notifications.removePushSubscription, win: d.win });
    expect(await db.pushSubscription.findUnique({ where: { endpoint: d.endpoint } })).toBeNull();
    expect(d.sub.unsubscribe).toHaveBeenCalled();
  });

  it('can’t remove another parent’s subscription (permission)', async () => {
    as('u_ana');
    const d = device();
    ok(await turnOnPush({ key: KEY, save: notifications.savePushSubscription, win: d.win }));
    as('u_grace');
    ok(await notifications.removePushSubscription({ endpoint: d.endpoint }));
    expect(await db.pushSubscription.findUnique({ where: { endpoint: d.endpoint } })).not.toBeNull();
  });

  it('never blocks signing out: a failing or hanging server call still finishes', async () => {
    const failing = device({ subscribed: true });
    await expect(forgetPush({ remove: async () => Promise.reject(new Error('offline')), win: failing.win })).resolves.toBeUndefined();
    expect(failing.sub.unsubscribe).toHaveBeenCalled();
    const hanging = device({ subscribed: true });
    await expect(forgetPush({ remove: () => new Promise(() => {}), win: hanging.win, timeoutMs: 50 })).resolves.toBeUndefined();
    await expect(forgetPush({ remove: async () => ({ ok: true }), win: { navigator: {} } })).resolves.toBeUndefined();
  });
});
