/** S19 holdouts: after the seed takes the account back, whoever signed up first gets nothing meant for Vienne. */
import { describe, expect, it, vi } from 'vitest';
import { as, db, freshDemo, ok } from '../../tests/integration/helpers';
import * as messages from '@/server/messages';
import * as notifications from '@/server/notifications';
import { ensureAdmin } from '../../prisma/data';

const sendNotification = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public';
  process.env.VAPID_PRIVATE_KEY = 'test-private';
  return vi.fn(async (_sub: { endpoint: string }, _body: string) => ({}));
});
vi.mock('web-push', () => ({ sendNotification, setVapidDetails: vi.fn() }));

freshDemo();

const device = (who: string) => `https://fcm.googleapis.com/fcm/send/s19-${who}`;

describe('S19 holdouts', () => {
  it('a device registered before the takeover receives no family’s message afterwards', async () => {
    const early = await db.user.create({ data: { id: 'u_s19_early', email: 'vienne.s19@example.com', name: 'Early Signup', passwordHash: 'x' } });
    as(early.id);
    ok(await notifications.savePushSubscription({ endpoint: device('early'), keys: { p256dh: 'p', auth: 'a' } }));

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await ensureAdmin(db as never, { email: 'vienne.s19@example.com', name: 'Vienne Elliott', password: 'viennes-real-password' });

    // The demo's admin has a device too, so we can tell the send has happened.
    as('u_admin');
    ok(await notifications.savePushSubscription({ endpoint: device('vienne'), keys: { p256dh: 'p', auth: 'a' } }));
    as('u_ana');
    ok(await messages.sendMessage({ body: 'A note only Vienne should get' }));
    await vi.waitFor(() => expect(sendNotification.mock.calls.map((c) => c[0].endpoint)).toContain(device('vienne')));
    await new Promise((r) => setTimeout(r, 500));
    expect(sendNotification.mock.calls.map((c) => c[0].endpoint)).not.toContain(device('early'));
  });
});

describe('S19 holdouts: wrong input', () => {
  it('a too-short ADMIN_PASSWORD is refused and the early account is left exactly as it was', async () => {
    const before = await db.user.create({ data: { id: 'u_s19_short', email: 'vienne.short@example.com', name: 'Early Signup', passwordHash: 'x' } });
    await expect(ensureAdmin(db as never, { email: 'vienne.short@example.com', name: 'Vienne Elliott', password: 'short' })).rejects.toThrow(/at least 8/);
    expect(await db.user.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
  });
});
