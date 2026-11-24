'use server';
/**
 * server/notifications — the in-app feed, and this device's push subscription.
 * Creating notifications is internal (lib/notify.ts), never an endpoint.
 * Contract: src/mock/server/notifications.js (+ savePushSubscription / removePushSubscription)
 */
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin, requireUser } from '@/lib/guards';
import { action, query } from '@/lib/result';
import { id, parse } from '@/lib/validate';
import { sendSessionReminders } from '@/lib/jobs';

export const listForUser = query(async () => {
  const user = await requireUser();
  return db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 });
});

export const markRead = action(async (input: { notificationId: string }) => {
  const user = await requireUser();
  const { notificationId } = parse(z.object({ notificationId: id }), input);
  await db.notification.updateMany({ where: { id: notificationId, userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return null;
});

export const markAllRead = action(async () => {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return null;
});

/** Day-before reminders. Runs from the daily cron (/api/cron/daily); Vienne can also run it. */
export const runDailyReminders = action(async () => {
  await requireAdmin();
  return sendSessionReminders();
});

/**
 * Browsers' push services. The server POSTs to whatever endpoint is saved, so only
 * these hosts are accepted (no requests to arbitrary addresses).
 */
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/];
const pushEndpoint = z
  .url()
  .max(1000)
  .refine((u) => {
    const url = new URL(u);
    return url.protocol === 'https:' && !url.port && PUSH_HOSTS.some((re) => re.test(url.hostname));
  }, 'That isn’t a browser push address');

const subscription = z.object({
  endpoint: pushEndpoint,
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  userAgent: z.string().max(300).optional(),
});

/** Saves this device's push subscription (PushManager.subscribe → toJSON()). */
export const savePushSubscription = action(async (input: z.input<typeof subscription>) => {
  const user = await requireUser();
  const v = parse(subscription, input);
  await db.pushSubscription.upsert({
    where: { endpoint: v.endpoint },
    create: { userId: user.id, endpoint: v.endpoint, p256dh: v.keys.p256dh, auth: v.keys.auth, userAgent: v.userAgent },
    update: { userId: user.id, p256dh: v.keys.p256dh, auth: v.keys.auth, userAgent: v.userAgent },
  });
  return null;
});

export const removePushSubscription = action(async (input: { endpoint: string }) => {
  const user = await requireUser();
  const { endpoint } = parse(z.object({ endpoint: z.string().max(1000) }), input);
  await db.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return null;
});
