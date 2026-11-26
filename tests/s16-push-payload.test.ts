/**
 * S16: the payload pushToUser sends (src/lib/push.ts) is what public/sw.js reads.
 * The service worker runs from its source in a sandbox with a fake `self`; web-push and the
 * database are fakes, so the test sees the exact JSON a device would receive.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('web-push', () => ({ sendNotification: fake.sendNotification, setVapidDetails: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { pushSubscription: { findMany: fake.findMany, deleteMany: vi.fn() } } }));

type Listener = (event: Record<string, unknown>) => void;

/** Loads public/sw.js with a fake service-worker global. */
function loadServiceWorker() {
  const listeners: Record<string, Listener> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const waits: Promise<unknown>[] = [];
  const self = {
    location: { origin: 'https://app.example' },
    addEventListener: (type: string, fn: Listener) => (listeners[type] = fn),
    registration: {
      showNotification: (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
        return Promise.resolve();
      },
    },
    clients: {
      matchAll: () => Promise.resolve([]),
      openWindow: (href: string) => {
        opened.push(href);
        return Promise.resolve();
      },
      claim: () => Promise.resolve(),
    },
    skipWaiting: () => Promise.resolve(),
  };
  const src = readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');
  vm.runInNewContext(src, { self, caches: {}, fetch: () => Promise.reject(new Error('offline')), URL });

  return {
    shown,
    opened,
    async push(json: unknown) {
      listeners.push({ data: { json: () => json }, waitUntil: (p: Promise<unknown>) => waits.push(p) });
      await Promise.all(waits);
    },
    /** Taps the last notification shown, as the browser would: with the data it was shown with. */
    async tapLast() {
      const last = shown[shown.length - 1];
      listeners.notificationclick({
        notification: { close: () => {}, data: last.options.data },
        waitUntil: (p: Promise<unknown>) => waits.push(p),
      });
      await Promise.all(waits);
    },
  };
}

let pushToUser: typeof import('@/lib/push').pushToUser;

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-public');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private');
  ({ pushToUser } = await import('@/lib/push'));
});

beforeEach(() => {
  fake.sendNotification.mockReset().mockResolvedValue({});
  fake.findMany.mockReset().mockResolvedValue([{ id: 's1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a' }]);
});

/** Sends through pushToUser and returns the JSON body web-push was given. */
async function sent(payload: Parameters<typeof pushToUser>[1]) {
  expect(await pushToUser('u1', payload)).toBe(1);
  const body = fake.sendNotification.mock.calls.at(-1)![1] as string;
  return JSON.parse(body) as Record<string, unknown>;
}

describe('S16: push payload and service worker agree', () => {
  it('tapping a notification opens its href', async () => {
    const payload = await sent({ title: 'New message', body: 'Hi', href: '/admin/messages/t1' });
    expect(payload).toMatchObject({ title: 'New message', body: 'Hi', href: '/admin/messages/t1' });

    const sw = loadServiceWorker();
    await sw.push(payload);
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0].title).toBe('New message');
    expect(sw.shown[0].options.body).toBe('Hi');
    await sw.tapLast();
    expect(sw.opened).toEqual(['/admin/messages/t1']);
  });

  it('a notification without an href opens /', async () => {
    const payload = await sent({ title: 'Reminder', body: null, href: null });
    const sw = loadServiceWorker();
    await sw.push(payload);
    await sw.tapLast();
    expect(sw.opened).toEqual(['/']);
  });

  it('passes the tag to showNotification, so a newer one with the same tag replaces the older', async () => {
    const first = await sent({ title: 'Message 1', href: '/messages/t1', tag: 'thread:t1' });
    const second = await sent({ title: 'Message 2', href: '/messages/t1', tag: 'thread:t1' });
    const sw = loadServiceWorker();
    await sw.push(first);
    await sw.push(second);
    expect(sw.shown.map((n) => n.options.tag)).toEqual(['thread:t1', 'thread:t1']);
    expect(sw.shown[1].options.renotify).toBe(true);
  });

  it('a notification without a tag is shown without one', async () => {
    const payload = await sent({ title: 'Hello' });
    const sw = loadServiceWorker();
    await sw.push(payload);
    expect(sw.shown[0].options).not.toHaveProperty('tag');
    expect(sw.shown[0].options).not.toHaveProperty('renotify');
  });
});
