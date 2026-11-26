/** S16 holdouts: a real message pushes only to its recipient, and tapping it with the app already open goes to that thread. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { as, freshDemo, ok } from '../integration/helpers';
import * as messages from '@/server/messages';
import * as notifications from '@/server/notifications';

const sendNotification = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public';
  process.env.VAPID_PRIVATE_KEY = 'test-private';
  return vi.fn(async (_sub: { endpoint: string }, _body: string) => ({}));
});
vi.mock('web-push', () => ({ sendNotification, setVapidDetails: vi.fn() }));

freshDemo();

const device = (who: string) => `https://fcm.googleapis.com/fcm/send/s16-${who}`;

/** public/sw.js with the app already open in one window. */
function openApp() {
  const on: Record<string, (e: unknown) => void> = {};
  const shown: { title: string; options: { data: unknown; tag?: string } }[] = [];
  const visited: string[] = [];
  const waits: Promise<unknown>[] = [];
  const win = { url: 'https://app.example/admin/today', focus: async () => undefined, navigate: async (href: string) => void visited.push(href) };
  const self = {
    location: { origin: 'https://app.example' },
    addEventListener: (type: string, fn: (e: unknown) => void) => (on[type] = fn),
    registration: { showNotification: async (title: string, options: { data: unknown }) => void shown.push({ title, options }) },
    clients: { matchAll: async () => [win], openWindow: async (href: string) => void visited.push(`new window ${href}`) },
  };
  vm.runInNewContext(readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8'), { self, URL, caches: {}, fetch });
  const waitUntil = (p: Promise<unknown>) => waits.push(p);
  return {
    shown,
    visited,
    async push(body: string) {
      on.push({ data: { json: () => JSON.parse(body) }, waitUntil });
      await Promise.all(waits);
    },
    async tap(i: number) {
      on.notificationclick({ notification: { close() {}, data: shown[i].options.data }, waitUntil });
      await Promise.all(waits);
    },
  };
}

describe('S16 holdouts', () => {
  it('Ana’s message reaches only Vienne’s device, opens her thread, and a repeat carries the same tag', async () => {
    for (const [userId, who] of [['u_admin', 'vienne'], ['u_ana', 'ana'], ['u_grace', 'grace']]) {
      as(userId);
      ok(await notifications.savePushSubscription({ endpoint: device(who), keys: { p256dh: 'p', auth: 'a' } }));
    }
    as('u_ana');
    ok(await messages.sendMessage({ body: 'First note' }));
    await vi.waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(1));
    ok(await messages.sendMessage({ body: 'Second note' }));
    await vi.waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(2));
    expect(sendNotification.mock.calls.map((c) => c[0].endpoint)).toEqual([device('vienne'), device('vienne')]);

    const app = openApp();
    for (const [, body] of sendNotification.mock.calls) await app.push(body);
    expect(app.shown[0].options.tag).toBeTruthy();
    expect(app.shown[1].options.tag).toBe(app.shown[0].options.tag);
    await app.tap(1);
    expect(app.visited).toEqual(['/admin/messages/conv_ana']);
  });
});
