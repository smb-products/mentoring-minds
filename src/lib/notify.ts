import 'server-only';
import { after } from 'next/server';
import { db } from './db';
import { pushToUser } from './push';

/**
 * Internal helpers, deliberately NOT in a 'use server' file: every export of a
 * 'use server' module is a public endpoint, and these must only be called by
 * other server code.
 *
 * Every notification goes to the in-app feed; it's also pushed to the user's
 * devices when push is set up. A failed push never fails the action.
 *
 * Call these AFTER a transaction commits, so nobody is told about a change that
 * was rolled back.
 */
export type NewNotification = { userId: string; audience: 'ADMIN' | 'PARENT'; type: string; title: string; body?: string | null; href?: string | null };

export async function notify(n: NewNotification) {
  const row = await db.notification.create({ data: { ...n, body: n.body ?? null, href: n.href ?? null, channel: 'IN_APP', sentAt: new Date() } });
  afterResponse(() => pushToUser(n.userId, { title: n.title, body: n.body, href: n.href, tag: pushTag(n) }));
  return row;
}

/**
 * The push's tag: a newer push with the same tag replaces the older one on the phone, so it
 * names what the push is about. A message is about its thread. Anything else is about its type,
 * the item it opens and who it's about (the title names the family or child: one assignment
 * handed in by two families, or two families' session requests, open the same page). One
 * without an href keeps its type alone.
 */
function pushTag(n: NewNotification) {
  const thread = n.type.startsWith('MESSAGE') && n.href?.match(/\/messages\/([^/?#]+)/)?.[1];
  if (thread) return `thread:${thread}`;
  return n.href ? `${n.type}:${n.href}:${n.title}` : n.type;
}

/**
 * Runs `task` after the response is sent. On Vercel a function can be frozen as soon
 * as it responds, so un-awaited work (like sending a push) must go through after().
 * Outside a request (tests, scripts, the cron's direct calls) it just runs now.
 */
function afterResponse(task: () => Promise<unknown>) {
  const run = () => task().catch((e) => console.error('after-response task failed', e));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Notify Vienne (every admin account). */
export async function notifyAdmins(n: Omit<NewNotification, 'userId' | 'audience'>) {
  const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  await Promise.all(admins.map((a) => notify({ ...n, userId: a.id, audience: 'ADMIN' })));
}
